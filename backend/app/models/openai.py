from __future__ import annotations

from pydantic import Field

from .screening import StrictModel


class OpenAIUsage(StrictModel):
    configured_model: str
    actual_model: str | None = None
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    tool_calls: int = Field(default=0, ge=0)
    request_rounds: int = Field(default=0, ge=0)
    cache_hits: int = Field(default=0, ge=0)
