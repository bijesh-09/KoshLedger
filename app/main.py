from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.database import check_db_conn, engine

from app.routers import auth, users

async def lifespan(app: FastAPI):
     # Runs once when this server process starts
    await check_db_conn()

    yield  # FastAPI serves requests while paused here

    # Runs once when this server process shuts down
    await engine.dispose()

app = FastAPI(lifespan=lifespan)

origins = []

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SANITIZATION of response when ValidationError occurs
# A typical res body when RequestValidationError raised is:
# {
#     "detail": [
#         {
#             "type": "string_too_short",
#             "loc": [
#                 "body",
#                 "password"
#             ],
#             "msg": "String should have at least 8 characters",
#             "input": "Bro123",
#             "ctx": {
#                 "min_length": 8
#             }
#         }
#     ]
# }

# SO WE ARE TRYING TO REMOVE SENSITIVE FIELDS LIKE these, but non sensitive fields can be in respoonse
SENSITIVE_FIELDS = {"password", "token", "access_token", "refresh_token"}
# NOTE: the client knows what input they have given ofc, but we are just trying to strip sensitive fields during VALIDATIONERROR, 
            # in successful response, the intended fields like access_token are going to be returned anyway
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request: Request,
    exc: RequestValidationError,
):
    safe_errors = []

    for error in exc.errors():
        safe_error = dict(error) # making copy of original error so that original wont be mutated
        
        # Pydantic includes other exceptions like ValueError, etc in the error’s ctx dictionary. JSONResponse can’t 
        #   serialize a Python ValueError object into JSON, so remove ctx
        safe_error.pop("ctx", None)
        location = error.get("loc", ()) # () is emty tuple as fallback default value if "loc" doesnt exist

        if any( # any returns true if any one of the case it true
            isinstance(part, str) and part.lower() in SENSITIVE_FIELDS # isinstance checks if "part" is of datatype str or not
            for part in location
        ):
            safe_error.pop("input", None) # None is fallback defalt value if "input" isnt found

        safe_errors.append(safe_error)

    return JSONResponse(status_code=422, content={"detail": safe_errors})

@app.get("/")
async def root():
    return {"message": "Hello World"}

app.include_router(auth.router)
app.include_router(users.router)