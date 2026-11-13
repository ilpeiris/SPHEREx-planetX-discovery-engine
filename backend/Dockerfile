# ==============================================================================
# Author:     M.D.Isuru Lakmal Peiris (@ilpeiris) 
# Project:    SPHEREx x Planet X (2026 NASA International Space Apps Challenge)
# Repository: https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine
# LinkedIn:   https://www.linkedin.com/in/ilpeiris
# Github:     https://github.com/ilpeiris/
# License:    MIT License | Copyright (c) 2026 M.D.Isuru Lakmal Peiris
# ==============================================================================





# Dockerfile for Hugging Face Spaces (16 GB RAM, 2 vCPU Free Tier) & Local Docker
FROM python:3.11-slim

# Install C/C++ build tools and astronomy libraries (CFITSIO, GEOS, FFTW, curl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcfitsio-dev \
    libgeos-dev \
    libfftw3-dev \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user required by Hugging Face Spaces (UID 1000)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MPLCONFIGDIR=/tmp/matplotlib_cache \
    ASTROPY_CACHE_DIR=/tmp/astropy_cache

WORKDIR $HOME/app

# Copy and install pinned Python dependencies
COPY --chown=user:user requirements.txt $HOME/app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r $HOME/app/requirements.txt

# Pre-download and cache signed DuckDB 1.2.1 core extensions (httpfs, spatial, parquet)
# at build time so runtime container sandboxes never fail on outbound extension fetches
RUN python -c "import duckdb; con = duckdb.connect(); \
    con.execute('INSTALL httpfs; INSTALL spatial; INSTALL parquet;'); \
    con.close()"

# Create local LRU cache directories for SAPM calibration matrices and FITS cutouts
RUN mkdir -p /tmp/spherex_cache /tmp/matplotlib_cache /tmp/astropy_cache $HOME/app/cache/sapm

# Copy backend application source
COPY --chown=user:user . $HOME/app

EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]