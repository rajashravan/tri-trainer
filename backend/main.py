from fastapi import FastAPI
from pydantic import BaseModel

from core.greeting import greet

app = FastAPI()


class GreetRequest(BaseModel):
    name: str


class GreetResponse(BaseModel):
    message: str
    timestamp: str


@app.post("/api/greet", response_model=GreetResponse)
def greet_endpoint(req: GreetRequest) -> GreetResponse:
    return GreetResponse(**greet(req.name))
