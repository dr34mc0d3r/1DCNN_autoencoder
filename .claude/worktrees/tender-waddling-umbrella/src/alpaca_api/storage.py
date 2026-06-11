import json
import os
from datetime import datetime

import pandas as pd
import pymysql

from .config import CSV_OUTPUT_DIR
from .db import get_connection, init_tables


def _insert_bars(cur, symbol: str, timeframe: str, bars: list[dict]) -> None:
    for bar in bars:
        cur.execute(
            """
            INSERT IGNORE INTO bars
                (symbol, timeframe, timestamp, open, high, low, close, volume, vwap, trade_count)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                symbol, timeframe,
                bar["t"], bar["o"], bar["h"], bar["l"], bar["c"],
                bar["v"], bar.get("vw"), bar.get("n"),
            ),
        )


def save_bars_to_db(symbol: str, timeframe: str, bars: list[dict]) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _insert_bars(cur, symbol, timeframe, bars)
    except pymysql.err.ProgrammingError as exc:
        if exc.args[0] == 1146:  # table doesn't exist
            conn.close()
            init_tables()
            conn = get_connection()
            with conn.cursor() as cur:
                _insert_bars(cur, symbol, timeframe, bars)
        else:
            raise
    finally:
        conn.close()


def save_bars_to_csv(symbol: str, timeframe: str, bars: list[dict]) -> str:
    df = pd.DataFrame(bars)
    df.rename(columns={"t": "timestamp", "o": "open", "h": "high", "l": "low",
                        "c": "close", "v": "volume", "vw": "vwap", "n": "trade_count"},
               inplace=True)
    out_dir = os.path.join(CSV_OUTPUT_DIR, symbol)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{timeframe}.csv")
    df.to_csv(path, index=False)
    return path


def _insert_news(cur, articles: list[dict]) -> None:
    for a in articles:
        cur.execute(
            """
            INSERT IGNORE INTO news_articles
                (news_id, headline, summary, author, published_at, url, symbols)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(a.get("id")),
                a.get("headline"),
                a.get("summary"),
                a.get("author"),
                a.get("created_at"),
                a.get("url"),
                json.dumps(a.get("symbols", [])),
            ),
        )


def save_news_to_db(articles: list[dict]) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _insert_news(cur, articles)
    except pymysql.err.ProgrammingError as exc:
        if exc.args[0] == 1146:  # table doesn't exist
            conn.close()
            init_tables()
            conn = get_connection()
            with conn.cursor() as cur:
                _insert_news(cur, articles)
        else:
            raise
    finally:
        conn.close()


def save_news_to_csv(symbols: list[str], articles: list[dict]) -> str:
    df = pd.DataFrame(articles)
    tag = "_".join(sorted(s.upper() for s in symbols))
    out_dir = os.path.join(CSV_OUTPUT_DIR, "news")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{tag}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv")
    df.to_csv(path, index=False)
    return path
