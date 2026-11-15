from concurrent.futures import ProcessPoolExecutor
import aiohttp
import gradio as gr
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware

from app.config import settings
from app.main import app as fastapi_app, init_duckdb_connection

try:
    import spaces

    @spaces.GPU
    def spherex_gpu_probe():
        return "SPHEREx x Planet X 102-Band Engine Ready"
except Exception:
    def spherex_gpu_probe():
        return "SPHEREx x Planet X 102-Band Engine Ready"

# Initialize DuckDB, ProcessPool, and SAPM cache on fastapi_app.state
fastapi_app.state.duckdb = init_duckdb_connection()
fastapi_app.state.process_pool = ProcessPoolExecutor(max_workers=settings.PROCESS_POOL_WORKERS)
fastapi_app.state.sapm_cache = {}
fastapi_app.state.http_session = None

with gr.Blocks(title="SPHEREx x Planet X API") as demo:
    gr.Markdown("## SPHEREx × Planet X 102-Band Multi-Epoch Discovery Engine API — Running on Port 7860")
    status_btn = gr.Button("Check Engine Status")
    status_out = gr.Textbox(label="Status")
    status_btn.click(fn=spherex_gpu_probe, outputs=status_out)

if __name__ == "__main__":
    demo.launch(
        server_name="0.0.0.0",
        server_port=7860,
        prevent_thread_lock=True,
        ssr_mode=False,
    )

    # Mirror state onto demo.app.state so request.app.state works inside all FastAPI routes
    demo.app.state.duckdb = fastapi_app.state.duckdb
    demo.app.state.process_pool = fastapi_app.state.process_pool
    demo.app.state.sapm_cache = fastapi_app.state.sapm_cache
    demo.app.state.http_session = None

    async def _ensure_http_session(request, call_next):
        if getattr(fastapi_app.state, "http_session", None) is None or fastapi_app.state.http_session.closed:
            connector = aiohttp.TCPConnector(limit=settings.AIOHTTP_MAX_CONNECTIONS, ssl=False)
            session = aiohttp.ClientSession(connector=connector)
            fastapi_app.state.http_session = session
            demo.app.state.http_session = session
        return await call_next(request)

    demo.app.include_router(fastapi_app.router)
    demo.app.user_middleware.insert(
        0,
        Middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["*"],
            expose_headers=["X-SPHEREx-Cube-Slices", "X-SPHEREx-Source"],
        ),
    )
    demo.app.user_middleware.insert(1, Middleware(BaseHTTPMiddleware, dispatch=_ensure_http_session))
    demo.app.middleware_stack = demo.app.build_middleware_stack()
    demo.block_thread()
