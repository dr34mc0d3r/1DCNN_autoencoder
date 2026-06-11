from fastapi import FastAPI

from .db import init_tables
from .routes.bars import router as bars_router
from .routes.news import router as news_router

app = FastAPI(title="Alpaca Data API", version="0.1.0")


@app.on_event("startup")
def startup():
    try:
        init_tables()
    except Exception as exc:
        import logging
        logging.getLogger("uvicorn.error").error("init_tables failed at startup: %s", exc)


app.include_router(bars_router)
app.include_router(news_router)
