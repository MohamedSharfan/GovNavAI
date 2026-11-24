"""Deterministic, translated labels and fixed messages (no model involved)."""

from __future__ import annotations

from govnav_agents.schemas import Lang, LocalizedText, OfficeType

OFFICE_LABELS: dict[OfficeType, LocalizedText] = {
    OfficeType.GN: LocalizedText(en="Grama Niladhari", si="ග්‍රාම නිලධාරී", ta="கிராம அலுவலர்"),
    OfficeType.DS: LocalizedText(en="Divisional Secretariat", si="ප්‍රාදේශීය ලේකම් කාර්යාලය", ta="பிரதேச செயலகம்"),
    OfficeType.DISTRICT: LocalizedText(en="District Secretariat", si="දිස්ත්‍රික් ලේකම් කාර්යාලය", ta="மாவட்ட செயலகம்"),
    OfficeType.RGD: LocalizedText(
        en="Divisional Secretariat (Registrar)",
        si="ප්‍රාදේශීය ලේකම් කාර්යාලය (රෙජිස්ට්‍රාර්)",
        ta="பிரதேச செயலகம் (பதிவாளர்)",
    ),
    OfficeType.DRP: LocalizedText(
        en="Registration of Persons (via DS)",
        si="පුද්ගලයින් ලියාපදිංචි කිරීම (ප්‍රා.ලේ. හරහා)",
        ta="ஆட்பதிவுத் திணைக்களம் (பி.செ. ஊடாக)",
    ),
    OfficeType.LAND_REGISTRY: LocalizedText(en="Land Registry", si="ඉඩම් රෙජිස්ට්‍රාර් කාර්යාලය", ta="காணிப் பதிவகம்"),
    OfficeType.OTHER: LocalizedText(en="Government office", si="රජයේ කාර්යාලය", ta="அரசு அலுவலகம்"),
}

DECLINE_TEXT = LocalizedText(
    en=(
        "I'm sorry, I can't confirm this from our verified records yet, so I won't guess. "
        "Please ask at your Grama Niladhari or Divisional Secretariat, or call the "
        "Government Information Center on 1919."
    ),
    si=(
        "සමාවන්න, අපගේ තහවුරු කළ තොරතුරු අනුව මට මෙය තවම සහතික කළ නොහැක, එබැවින් අනුමාන කරන්නේ නැත. "
        "කරුණාකර ඔබේ ග්‍රාම නිලධාරී හෝ ප්‍රාදේශීය ලේකම් කාර්යාලයෙන් විමසන්න, නැතහොත් "
        "රජයේ තොරතුරු මධ්‍යස්ථානයට 1919 අමතන්න."
    ),
    ta=(
        "மன்னிக்கவும், எங்கள் சரிபார்க்கப்பட்ட பதிவுகளில் இதை இன்னும் உறுதிப்படுத்த முடியவில்லை, "
        "எனவே ஊகிக்க மாட்டேன். உங்கள் கிராம அலுவலர் அல்லது பிரதேச செயலகத்தில் கேளுங்கள், அல்லது "
        "அரசாங்க தகவல் நிலையத்தை 1919 இல் அழையுங்கள்."
    ),
)

GREETING_TEXT = LocalizedText(
    en="Hello! Tell me what you need from the government, for example an income certificate, and I'll tell you the office, fee, documents and form.",
    si="ආයුබෝවන්! රජයෙන් ඔබට අවශ්‍ය දේ කියන්න. උදාහරණයක් ලෙස ආදායම් සහතිකයක්. මම කාර්යාලය, ගාස්තුව, ලේඛන සහ පෝරමය කියන්නම්.",
    ta="வணக்கம்! அரசாங்கத்திடம் உங்களுக்கு என்ன தேவை என்று சொல்லுங்கள். உதாரணமாக வருமானச் சான்றிதழ். அலுவலகம், கட்டணம், ஆவணங்கள், படிவம் பற்றிச் சொல்கிறேன்.",
)

OFFICE_DECIDES = LocalizedText(
    en="GovNavAI prepares you; the office makes the final decision.",
    si="GovNavAI ඔබව සූදානම් කරයි; අවසන් තීරණය කාර්යාලයයි.",
    ta="GovNavAI உங்களைத் தயார்படுத்துகிறது; இறுதி முடிவு அலுவலகத்தினுடையது.",
)


def office_label(office_type: OfficeType, lang: Lang) -> str:
    return OFFICE_LABELS[office_type].get(lang)
