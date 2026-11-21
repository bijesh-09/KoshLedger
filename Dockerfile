# syntax=docker/dockerfile:1 
# note this is a special comment which is a docker directiveit tells the parser to use new 
# Dockerfile frontend parser cuz RUN "--mount=type=cache.." is new Buildkit feature and is supported in modern versions only

# stage1(builder): installs deps in .venv/ and throws away the build and tool chains like uv, cuz our app only needs .venv/
FROM python:3.14-slim-trixie AS builder 

# astral serves uv image primarily in github container registry(ghcr)
# copy the image's uv tool to builder's temp "build container"
COPY --from=ghcr.io/astral-sh/uv:0.13.8 /uv /bin/uv

# About: UV_LINK_MODE=copy, normally uv hardlinks the cache and the .venv/, but our temp build container's /root/.cache/uv is mounted to buildkit's(docker build engine) cache(which
#  is stored in host machine, u can see via docker system df), meanwhile the /koshledger/.venv is stored in the temp container only, so making hardlinks betwn two fs
#   is impossible, thats why making linkmode set to "copy" makes them two different copies so they wont collide
# About UV_PYTHON_DOWNLOADS=0, it tells uv to use the already pulled baseimage's python rather than downloading python itself
ENV UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0

# make this dir though appuser doesnt exist in builder stage, its cuz if it was diff dir like /koshledger then the abs path of .venv would be 
#   recorded as #!/koshledger/.venv/bin/python3 for gunicorn, and though the .venv would be copied to runtime stage at ~/koshledger for appuser, the gunicorn
#       would still point to #!/koshledger/.venv/bin/python3 which wont exist in runtime stage
WORKDIR /home/appuser/koshledger

# copy these files from our host machine to temp build container's workdir
COPY pyproject.toml uv.lock ./

# this is the reason why we set UV_LINK_MODE=copy, as we are mounting the buildkit's cache to current temp build container's cache
# uv sync normally installs deps in .venv/ making sure the uv.lock and pyprojecttoml matches with venv deps and if not resolves them auto,
#  but --locked doesnt resolves if there are changes instead it throws err, cuz we dont want someone change pyproject.toml before deploying to prod
# note we dont ve to give --no-project-install to uv sync cuz pyprojecttoml has package=false which means the project itself is not installed into .venv as a python package
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev

#in multistage build only the last stage becomes final image, while all previous stages are thrown away, making final image size less


# stage2(runtime): copy only what app needs to run
FROM python:3.14-slim-trixie AS runtime

# PYTHONDONTWRITEBYTECODE=1 tells python not to compile the source code into bytecode(.pyc), cuz it will make image bloated, we just want source code
# PYTHONUNBUFFERED=1, normally python sends the process logs(like Traceback to, our custom prints etc) only if buffer gets fulled which can be come late in Render host, 
#  so we set it 0 so that the logs are send immediately when the process writes it.
# PATH="/app/.venv/bin:$PATH", its like source .../.venv/bin/activate so that the gunicorn uses venv's python not the system's python
ENV PYTHONDONTWRITEBYTECODE=1 \ 
    PYTHONUNBUFFERED=1 \
    PATH="/home/appuser/koshledger/.venv/bin:$PATH"

# Non-root user; the home dir is used by gunicorn for its control socket.
# setting uid high so that it wont clash with other users
RUN useradd --create-home --uid 10001 appuser

WORKDIR /home/appuser/koshledger

# this is where the throwaway builder stage is useful for:
COPY --from=builder --chown=appuser:appuser /home/appuser/koshledger/.venv ./.venv

# Application code + migrations.
COPY --chown=appuser:appuser app/ ./app
COPY --chown=appuser:appuser alembic/ ./alembic
COPY --chown=appuser:appuser alembic.ini ./alembic.ini

USER appuser

# sh -c means the given string "exec gunicorn.." is a command and run it
# normally shell creates a child process that does the actually runs the command and waits for it, so this makes sh as PID 1
#   but we want gunicorn as PID 1, so thats what "exec" does
# ${PORT:-8000} means use given the port if its set else fallback to 8000, NOTE: the "-" isnt negative, its part of literal operator ":-"
# NOTE: not running alembic upgrade head is intentional cuz if there are multiple replicas of this image's container then all would try to migrate db which could cause race conditon
CMD [ "sh", "-c", "exec gunicorn -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:${PORT:-8000} app.main:app" ]