"""OpenRouter proxy service — routes LLM calls per company key."""

import httpx
from app.core.config import settings


async def stream_chat(
    openrouter_key: str,
    model: str,
    messages: list[dict],
    skills_prompt: str = "",
    soul_content: str = "",
) -> httpx.AsyncIterator:
    """
    Stream a chat completion via OpenRouter.
    
    Args:
        openrouter_key: Company-specific OpenRouter API key
        model: Model ID (e.g. 'openai/gpt-4o-mini')
        messages: Chat history [{role, content}]
        skills_prompt: Injected skills context
        soul_content: SOUL.md system prompt
    """
    # Build system message from SOUL + skills
    system_msg = soul_content
    if skills_prompt:
        system_msg += f"\n\n## Skills Ativas\n{skills_prompt}"

    full_messages = [{"role": "system", "content": system_msg}] + messages

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{settings.OPENROUTER_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {openrouter_key}",
                "HTTP-Referer": "https://hermes-saas.app",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": full_messages,
                "stream": True,
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    yield line


async def count_tokens(openrouter_key: str, model: str, messages: list[dict]) -> int:
    """Approximate token count (OpenRouter doesn't have a token endpoint)."""
    # Simple heuristic: ~4 chars per token
    total_chars = sum(len(m.get("content", "")) for m in messages)
    return total_chars // 4
