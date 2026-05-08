"""Regression guard: JOB_ANALYSIS_PROMPT must contain explicit prompt-injection defense.

The DiscoveredJob docstring requires: "Every Claude call that reads ``description``
MUST use a system prompt that explicitly ignores embedded instructions."

This test fails loudly if that preamble is ever removed or weakened, so a
future edit to the prompt file surfaces the regression in CI before it ships.
"""

from app.services.extraction.prompts.job_analysis_prompt import JOB_ANALYSIS_PROMPT


def test_prompt_contains_injection_defense_keyword():
    """JOB_ANALYSIS_PROMPT must instruct the model to treat JD content as data."""
    prompt_lower = JOB_ANALYSIS_PROMPT.lower()
    assert "treat all content" in prompt_lower, (
        "JOB_ANALYSIS_PROMPT is missing the prompt-injection defense preamble. "
        "Add a sentence instructing the model to treat job description content as "
        "data, not instructions."
    )


def test_prompt_ignores_embedded_instructions():
    """JOB_ANALYSIS_PROMPT must explicitly tell the model to ignore embedded instructions."""
    prompt_lower = JOB_ANALYSIS_PROMPT.lower()
    assert "ignore" in prompt_lower and "instruction" in prompt_lower, (
        "JOB_ANALYSIS_PROMPT must explicitly say to ignore embedded instructions "
        "within the job description."
    )


def test_prompt_data_not_instructions_phrase():
    """JOB_ANALYSIS_PROMPT must contain 'not as instructions' or equivalent."""
    prompt_lower = JOB_ANALYSIS_PROMPT.lower()
    assert "not as instructions" in prompt_lower, (
        "JOB_ANALYSIS_PROMPT preamble must contain 'not as instructions' to make "
        "the prompt-injection defense explicit."
    )
