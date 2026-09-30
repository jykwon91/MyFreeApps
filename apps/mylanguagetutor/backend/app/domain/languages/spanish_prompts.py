"""Spanish (Latin American, es-MX voice) prompt pack."""
from __future__ import annotations

from app.domain.languages.prompt_pack import LanguagePromptPack, ScenarioFragment

SPANISH_PROMPTS = LanguagePromptPack(
    code="es",
    register_rule=(
        "Use tú with the learner unless the scenario is a formal service "
        "exchange where usted is natural (then model usted, but accept tú "
        "from the learner without correcting it). Use Latin American Spanish: "
        "ustedes (never vosotros), and everyday Mexican/Latin American words."
    ),
    repair_phrases=(
        "¿Puede repetir, por favor?",
        "Más despacio, por favor.",
        "No entiendo.",
        "¿Cómo se dice ... en español?",
        "¿Qué significa ...?",
    ),
    didnt_catch_reply="Perdón, no te escuché bien. ¿Me lo repites?",
    scenarios={
        "greetings": ScenarioFragment(
            setting="You meet the learner for the first time at a friendly language exchange.",
            model_phrases=(
                "Hola, ¿qué tal?",
                "Me llamo ...",
                "¿Cómo te llamas?",
                "Mucho gusto.",
                "Encantado / Encantada.",
            ),
        ),
        "repair-phrases": ScenarioFragment(
            setting=(
                "You are a chatty neighbour who sometimes talks a little fast, so "
                "the learner gets chances to ask you to repeat or slow down. Keep "
                "it gentle: create the need, then reward the repair."
            ),
            model_phrases=(
                "¿Puede repetir, por favor?",
                "Más despacio, por favor.",
                "No entiendo.",
                "¿Qué significa ...?",
            ),
        ),
        "about-me": ScenarioFragment(
            setting="You are getting to know the learner over coffee.",
            model_phrases=(
                "¿De dónde eres?",
                "Soy de ...",
                "Vivo en ...",
                "Trabajo en ... / Estudio ...",
                "¿Y tú?",
            ),
        ),
        "cafe": ScenarioFragment(
            setting="You are the barista at a small café in Mexico City. The learner is the customer.",
            model_phrases=(
                "¿Qué te sirvo? / ¿Qué le sirvo?",
                "Me da un café, por favor.",
                "Quisiera ...",
                "¿Cuánto cuesta?",
                "¿Para llevar o para aquí?",
            ),
        ),
        "paying": ScenarioFragment(
            setting=(
                "You are the cashier at a market stall. Say prices out loud with "
                "numbers the learner can handle, and ask them to confirm the total."
            ),
            model_phrases=(
                "Son ochenta y cinco pesos.",
                "¿Cuánto es?",
                "¿Aceptan tarjeta?",
                "Aquí tiene.",
                "Su cambio.",
            ),
        ),
        "directions": ScenarioFragment(
            setting="You are a local on the street. The learner is looking for a place nearby.",
            model_phrases=(
                "¿Dónde está ...?",
                "Siga derecho.",
                "Dé vuelta a la derecha / a la izquierda.",
                "Está a dos cuadras.",
                "Está enfrente de ...",
            ),
        ),
        "likes-weekend": ScenarioFragment(
            setting="You are a friend chatting about plans for the weekend.",
            model_phrases=(
                "¿Qué te gusta hacer?",
                "Me gusta ... porque ...",
                "El fin de semana voy a ...",
                "¿Y a ti?",
                "A mí también / A mí no.",
            ),
        ),
        "appointment": ScenarioFragment(
            setting=(
                "You are the receptionist at a clinic answering the phone. The "
                "learner wants to book an appointment."
            ),
            model_phrases=(
                "Quisiera hacer una cita.",
                "¿Qué día le queda bien?",
                "El martes a las diez.",
                "¿A nombre de quién?",
                "Entonces, el martes a las diez. ¿Correcto?",
            ),
        ),
        "free-talk": ScenarioFragment(
            setting=(
                "Open conversation. Follow the learner's interests; if they have "
                "nothing to say, offer two easy topics to choose from."
            ),
            model_phrases=(),
        ),
    },
)
