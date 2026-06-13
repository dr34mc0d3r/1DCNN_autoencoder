"""tests/neural/test_model.py"""

import torch
import pytest

from neural.model import ConvAutoencoder, Encoder, Decoder


N_FEAT, LATENT, WIN = 14, 8, 64


def _batch(n=4) -> torch.Tensor:
    return torch.randn(n, N_FEAT, WIN)


def test_encoder_output_shape():
    enc = Encoder(N_FEAT, LATENT)
    z = enc(_batch())
    assert z.shape == (4, LATENT)


def test_decoder_output_shape():
    dec = Decoder(N_FEAT, LATENT)
    z   = torch.randn(4, LATENT)
    out = dec(z)
    assert out.shape == (4, N_FEAT, WIN)


def test_autoencoder_roundtrip_shape():
    model = ConvAutoencoder(N_FEAT, LATENT)
    x = _batch()
    out = model(x)
    assert out.shape == x.shape


def test_autoencoder_no_nan():
    model = ConvAutoencoder(N_FEAT, LATENT)
    x = _batch()
    out = model(x)
    assert not torch.isnan(out).any()


def test_autoencoder_parameters_exist():
    model = ConvAutoencoder(N_FEAT, LATENT)
    params = list(model.parameters())
    assert len(params) > 0


def test_encoder_is_submodule(tiny_model):
    assert hasattr(tiny_model, "encoder")
    assert hasattr(tiny_model, "decoder")
