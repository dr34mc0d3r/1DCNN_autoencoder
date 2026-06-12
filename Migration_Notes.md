# Migration and Development Instructions

## Project Location

The new application **must be developed entirely within**:

```text
root/
└── src/
    └── v2/
```

The `root/src/v2` directory is a completely new, standalone application.

---

## Isolation Requirements

The `root/src/v2` project **must not reuse or depend on implementation code from `root/src`**.

Requirements:

* No importing Python modules from `root/src`.
* No importing React components from `root/src`.
* No sharing configuration files.
* No sharing build artifacts.
* No sharing runtime dependencies.
* No symbolic links between the projects.
* No partial migrations or incremental replacements.

The `root/src/v2` codebase must be entirely self-contained and independently executable.

---

## Existing Project Access

The existing `root/src` project should be treated as **read-only reference material**.

It may be used only for:

* Understanding existing functionality.
* Reviewing architecture and design decisions.
* Inspecting business logic.
* Comparing behavior.
* Validating feature parity.
* Assisting with migration planning.

It must **not** be modified.

It must **not** be used as a source for copy-and-paste implementation.

Instead, functionality should be reimplemented within `root/src/v2` according to the new architecture and specifications.

---

## Migration Planning Requirements

Before implementing any new code, perform a comprehensive review of the existing `root/src` project.

The review should identify:

* Existing application features.
* REST endpoints.
* WebSocket functionality.
* Data models.
* Configuration handling.
* Storage mechanisms.
* Background processing.
* Machine learning components.
* Utility modules.
* Shared libraries.
* User interface pages.
* External integrations.
* Testing infrastructure.

Based on this review, produce a detailed migration plan that maps existing functionality into the new `root/src/v2` architecture.

The migration plan should:

1. Inventory all major components in `root/src`.
2. Describe each component's purpose.
3. Identify whether it should be:

   * Reimplemented,
   * Redesigned,
   * Simplified,
   * Replaced, or
   * Omitted.
4. Specify its destination within the `root/src/v2` directory structure.
5. Document any architectural improvements or modernization opportunities.

The migration plan should be completed and approved before implementation begins.

---

## Source of Truth

Unless explicitly overridden by these migration instructions, the definitive requirements and architecture for the new application are defined in the **`src/v2` application specifications that follow below**.








# Python PyTorch Neural Network Application Architecture Specification

## Overview

This project is designed as a clean, modular, and maintainable client/server application consisting of:

* **ReactJS frontend**
* **FastAPI backend**
* **PyTorch neural network engine**
* **REST API**
* **WebSocket server for live updates**
* **Persistent backend configuration**
* **Automated testing with pytest**

The overall design philosophy is:

* Simple over clever
* Modular over monolithic
* Clear separation of concerns
* Single responsibility for every component
* No unnecessary frameworks or dependencies

---

# High-Level Architecture

```
                +-----------------------+
                |     React Frontend    |
                |-----------------------|
                | Configuration Page    |
                | Download Page         |
                | Neural Network Page   |
                | Live Charts           |
                +-----------+-----------+
                            |
                     REST / WebSocket
                            |
                +-----------v-----------+
                |    FastAPI Backend    |
                +-----------+-----------+
                            |
      +----------+----------+-----------+-----------+
      |          |                      |           |
      |          |                      |           |
 Config      REST Downloader      PyTorch Engine  WebSocket
 Manager      (Alpaca API)                      Streams
      |          |                      |           |
      +----------+----------+-----------+-----------+
                            |
                      Persistent Storage

          configs / downloads / models / logs
```

---

# Design Principles

## Backend Owns All State

The backend is responsible for (example):

* Configuration management
* File storage
* Model storage
* Data downloads
* Training
* Inference
* Logging
* WebSocket broadcasting

The frontend never directly accesses the filesystem.

---

## Frontend is Presentation Only

The React application is responsible only for:

* Displaying information
* Editing configuration
* Sending commands
* Visualizing neural networks
* Displaying charts
* Showing live status

The frontend performs:

* No machine learning
* No file I/O
* No model training
* No persistent storage

---

# Backend Technology Stack

## API Framework

```
FastAPI
```

Responsibilities:

* REST endpoints
* WebSocket endpoints
* Automatic OpenAPI documentation
* Dependency injection
* Request validation

---

## HTTP Client

```
httpx
```

Used for:

* Direct REST communication with the Alpaca API
* Asynchronous requests
* Connection pooling

Do **not** use `alpaca-py`.

---

## Machine Learning

```
torch
```

Responsible for:

* Neural network definition
* Training
* Inference
* Saving/loading models

---

## Numerical Processing

```
numpy
```

Used for numerical operations and tensor preprocessing.

---

## Data Manipulation

```
pandas
```

Used for:

* OHLCV processing
* Feature engineering
* CSV import/export
* Dataset preparation

---

## Configuration

Persistent configuration is stored as:

```
backend/config/config.json
```

Example:

```json
{
    "alpaca_key": "...",
    "alpaca_secret": "...",
    "sequence_length": 60,
    "hidden_size": 128,
    "epochs": 20
}
```

Rules:

* Backend exclusively reads and writes configuration.
* React communicates only through REST endpoints.
* React never accesses files directly.

---

# WebSocket Architecture

FastAPI provides the WebSocket implementation.

Typical streamed messages include (example):

* System status
* Training progress
* Current epoch
* Current batch
* Loss
* Accuracy
* Live inference results
* Download progress
* Heartbeat messages
* General notifications

The frontend subscribes once and receives updates in real time.

No polling should be required.

---

# Scheduling

Use only:

```
asyncio
```

Do not introduce:

* Celery
* Redis
* RabbitMQ

Keep scheduling lightweight and built into the application.

---

# Logging

Use Python's built-in:

```
logging
```

Configure logging once during application startup.

Suggested outputs:

```
logs/server.log
logs/train.log
```

Logs should include timestamps and severity levels.

---

# Frontend Technology Stack

## Framework

```
React (latest stable) vinalla javascript
```

---

## Routing

```
react-router-dom
```

Provides page routing.

---

## REST Communication

Use the browser-native:

```
fetch()
```

Do not introduce Axios.

---

## WebSocket Client

Use the browser-native:

```
WebSocket
```

No additional libraries required.

---

## Charting

```
Recharts
```

Recommended for:

* Loss curves
* Accuracy charts
* Live metrics
* Prediction visualization
* KMeans Cluster

---

## Forms

Use only React state management:

```
useState
useEffect
```

Do not use:

* Formik
* Redux

The application should remain lightweight.

---

## Styling

```
Tailwind CSS v4
```

---

# Frontend Responsibilities

React is responsible for:

* Rendering UI
* Displaying backend data
* Editing configuration
* Sending REST commands
* Receiving WebSocket events
* Displaying training metrics
* Displaying model status
* Displaying charts

React is **not** responsible for:

* Neural network execution
* Model storage
* File management
* Data downloads
* Training logic

---

# Neural Package Responsibilities

The `backend/neural` package contains only machine learning functionality.

It should have no knowledge of:

* REST APIs
* FastAPI
* React
* WebSockets
* HTTP requests

It should only contain:

* Model definitions
* Dataset preparation
* Training loops
* Inference logic
* Evaluation metrics

This keeps the machine learning layer portable and independently testable.

---

# Project Directory Structure

```
project/
└── src/

    ├── backend/
    │
    │   ├── app.py
    │
    │   ├── api/
    │   │   ├── config.py
    │   │   ├── download.py
    │   │   ├── train.py
    │   │   ├── infer.py
    │   │   └── status.py
    │   │
    │   ├── websocket/
    │   │   └── live.py
    │   │
    │   ├── neural/
    │   │   ├── model.py
    │   │   ├── dataset.py
    │   │   ├── trainer.py
    │   │   ├── inference.py
    │   │   └── metrics.py
    │   │
    │   ├── services/
    │   │   ├── alpaca.py
    │   │   ├── config_manager.py
    │   │   ├── downloader.py
    │   │   └── storage.py
    │   │
    │   ├── config/
    │   │   └── config.json
    │   │
    │   ├── downloads/
    │   │
    │   ├── models/
    │   │
    │   ├── logs/
    │   │
    │   └── requirements.txt
    │
    ├── tests/
    │
    │   ├── api/
    │   │   ├── test_config.py
    │   │   ├── test_download.py
    │   │   ├── test_train.py
    │   │   └── test_status.py
    │   │
    │   ├── neural/
    │   │   ├── test_model.py
    │   │   ├── test_dataset.py
    │   │   ├── test_trainer.py
    │   │   └── test_metrics.py
    │   │
    │   ├── services/
    │   │   ├── test_alpaca.py
    │   │   ├── test_config_manager.py
    │   │   ├── test_downloader.py
    │   │   └── test_storage.py
    │   │
    │   ├── websocket/
    │   │   └── test_live.py
    │   │
    │   ├── fixtures/
    │   │   ├── sample_config.json
    │   │   ├── sample_ohlcv.csv
    │   │   └── sample_model.pt
    │   │
    │   └── conftest.py
    │
    ├── frontend/
    │
    └── README.md
```

---

# Testing Architecture

Testing uses:

```
pytest
```

The guiding principle is:

> Every production module should have a corresponding test module.

Examples:

```
backend/services/alpaca.py

↓

tests/services/test_alpaca.py
```

```
backend/neural/model.py

↓

tests/neural/test_model.py
```

This one-to-one mapping makes navigation intuitive and encourages complete test coverage.

---

# Test Fixtures

Reusable test assets belong in:

```
tests/fixtures/
```

Example contents:

```
sample_config.json
sample_ohlcv.csv
sample_model.pt
```

Advantages:

* Eliminates repeated temporary file creation
* Ensures deterministic tests
* Improves maintainability
* Reduces duplicated setup logic

---

# Shared Test Configuration

```
tests/conftest.py
```

Should contain reusable fixtures such as:

* Temporary configuration directories
* Temporary download folders
* Temporary model storage
* Sample pandas DataFrames
* Sample tensors
* FastAPI test clients
* WebSocket test clients

Tests should reuse these fixtures whenever possible.

---

# Architectural Goals

The project should maintain the following properties throughout development:

* Clean separation of concerns
* Minimal dependency footprint
* Backend-centric state management
* Thin React presentation layer
* Independent machine learning module
* Modular services
* Comprehensive automated testing
* Easily understandable project layout
* Straightforward long-term maintenance
* Scalable foundation for future neural network experimentation
