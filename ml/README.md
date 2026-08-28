# ml

Python side: data generation, model training, and validation for the line
simulation and inference models. Scripts only, no notebooks — every result
must be reproducible by running a script from the command line.

## Setup

```
python -m venv .venv
.venv/Scripts/activate      # Windows
source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

Tested against Python 3.12. `numpy`, `pandas`, `scikit-learn`, and
`matplotlib` are pinned in `requirements.txt` — bump deliberately, not
implicitly.

`.venv/` is not committed (see root `.gitignore`). Trained model outputs go
in `artifacts/` as committed JSON. Never commit a dataset file.
