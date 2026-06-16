"""Soul template variable resolution."""

import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.company import Company
from app.models.user import User


async def resolve_soul_variables(
    soul_content: str,
    company: Company,
    user: User,
) -> str:
    """
    Replace {{variable}} placeholders in SOUL content with real data.
    
    Supported variables:
      {{company.name}}, {{company.tone}}, {{company.knowledge_base}}, {{company.rules}}
      {{user.name}}
    """
    replacements = {
        "company.name": company.name,
        "company.tone": company.tone or "",
        "company.knowledge_base": company.knowledge_base or "",
        "company.rules": company.rules or "",
        "user.name": user.name,
    }

    def _replace(match):
        var = match.group(1).strip()
        return replacements.get(var, match.group(0))

    return re.sub(r"\{\{(.+?)\}\}", _replace, soul_content)
