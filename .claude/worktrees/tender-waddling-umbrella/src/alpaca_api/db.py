import pymysql
from .config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT


def get_connection() -> pymysql.connections.Connection:
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        port=DB_PORT,
        autocommit=True,
    )


def init_tables() -> None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS bars (
                id          BIGINT AUTO_INCREMENT PRIMARY KEY,
                symbol      VARCHAR(10)    NOT NULL,
                timeframe   VARCHAR(10)    NOT NULL,
                timestamp   DATETIME       NOT NULL,
                open        DECIMAL(12,4),
                high        DECIMAL(12,4),
                low         DECIMAL(12,4),
                close       DECIMAL(12,4),
                volume      BIGINT,
                vwap        DECIMAL(12,4),
                trade_count INT,
                UNIQUE KEY uq_bar (symbol, timeframe, timestamp)
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS news_articles (
                id           BIGINT AUTO_INCREMENT PRIMARY KEY,
                news_id      VARCHAR(50) UNIQUE,
                headline     TEXT,
                summary      TEXT,
                author       VARCHAR(100),
                published_at DATETIME,
                url          TEXT,
                symbols      JSON
            )
        """)
    conn.close()
