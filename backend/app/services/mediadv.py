from sqlalchemy.orm import Session

from app.db.schemas import MedicalChatRequest
from app.models import ChatHistory, UserModel
from app.services.rag_service import answer_question


def _history_to_text(items: list[ChatHistory]) -> str:
    return "\n".join(f"{item.role}: {item.content}" for item in items[-8:])


async def generate_medical_chat_reply(
    *,
    payload: MedicalChatRequest,
    current_user: UserModel,
    db: Session,
) -> str:
    previous_rows = db.query(ChatHistory).filter(
        ChatHistory.user_id == current_user.id,
        ChatHistory.session_id == payload.session_id,
    ).order_by(ChatHistory.created_at.asc()).all()

    db.add(ChatHistory(
        user_id=current_user.id,
        session_id=payload.session_id,
        role="user",
        content=payload.message,
    ))
    db.commit()

    reply = await answer_question(
        payload.session_id,
        payload.message,
        _history_to_text(previous_rows),
        payload.language,
    )

    db.add(ChatHistory(
        user_id=current_user.id,
        session_id=payload.session_id,
        role="assistant",
        content=reply,
    ))
    db.commit()
    return reply
