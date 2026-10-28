from fastapi import FastAPI
from app.database import check_db_conn, engine

async def lifespan(app: FastAPI):
     # Runs once when this server process starts
    await check_db_conn()

    yield  # FastAPI serves requests while paused here

    # Runs once when this server process shuts down
    await engine.dispose()

app = FastAPI(lifespan=lifespan)

@app.get("/")
async def root():
    return {"message": "Hello World"}