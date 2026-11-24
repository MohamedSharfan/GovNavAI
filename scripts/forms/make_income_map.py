"""Author the reviewed form_map.json for the Imbulpe DS income-certificate request form.

Boxes are normalised (top-left origin) and sit just above each dotted line, where a
citizen would write. Positions were read off the 2-page scan and checked by rendering
a test fill (render with services/agents govnav_agents.forms.overlay.render_preview_png).
"""

import json
import pathlib
import sys


def L(en, si, ta):
    return {"en": en, "si": si, "ta": ta}


def box(x0, y0, x1, y1):
    return {"x": round(x0, 4), "y": round(y0, 4), "w": round(x1 - x0, 4), "h": round(y1 - y0, 4)}


# Dotted-line y positions (normalised) read from the page-1 scan; text sits 0.018 above.
def on_line(x0, x1, line_y):
    # Text is top-aligned in its box; this puts the baseline just above the dotted line.
    return box(x0, line_y - 0.010, x1, line_y + 0.008)


F = []


def field(id_, number, label, page, bbox, type_="text", key=None, mode="auto", script="as_profile", optional=False,
          hint=None, max_chars=None, font=None):
    f = {"id": id_, "number": number, "label": label, "page": page, "bbox": bbox, "type": type_,
         "fillMode": mode, "script": script, "optional": optional}
    if key:
        f["profileKey"] = key
    if hint:
        f["hint"] = hint
    if max_chars:
        f["maxChars"] = max_chars
    if font:
        f["fontSize"] = font
    F.append(f)


# ---- Page 1: citizen ---------------------------------------------------------------
field("applicant-name", "01", L("Applicant's full name", "ඉල්ලුම් කරුගේ සම්පූර්ණ නම", "விண்ணப்பதாரரின் முழுப் பெயர்"),
      0, box(0.385, 0.188, 0.86, 0.226), "multiline", "fullName", "auto", "si", max_chars=120, font=11)
field("address", "02", L("Address", "ලිපිනය", "முகவரி"), 0, on_line(0.19, 0.86, 0.247), "text", "address", "auto", "si",
      max_chars=110, font=10.5)
field("employment-income", "03 (01)", L("Monthly/annual income from employment", "රැකියාවෙන් මාසික/වාර්ෂිකව ලැබෙන ආදායම",
      "வேலையிலிருந்து மாத/வருட வருமானம்"), 0, on_line(0.625, 0.83, 0.309), "text", None, "input", "en", optional=True, max_chars=30)
field("land-location", "03 (02) i", L("Location of land/property", "ඉඩම් හා දේපල පිහිටීම", "காணி/சொத்து அமைவிடம்"),
      0, box(0.39, 0.322, 0.83, 0.356), "multiline", None, "input", "si", optional=True, max_chars=90)
field("land-deed", "03 (02) ii", L("Deed number, date and notary", "ඔප්පු අංකය, දිනය හා නොතාරිස් තැනගේ නම",
      "உறுதி இலக்கம், திகதி, நொத்தாரிசு"), 0, on_line(0.64, 0.83, 0.378), "text", None, "input", "as_profile", optional=True, max_chars=50)
field("land-income", "03 (02) iii", L("Income from crops/buildings on the land", "ඉඩමේ වගාවෙන් / ගොඩනැගිලි වලින් ලැබෙන ආදායම",
      "காணிப் பயிர்/கட்டட வருமானம்"), 0, on_line(0.15, 0.6, 0.421), "text", None, "input", "en", optional=True, max_chars=40)
field("business-name", "03 (03) i", L("Name of the business", "ව්‍යාපාරයේ නම", "வணிகத்தின் பெயர்"),
      0, on_line(0.385, 0.83, 0.453), "text", None, "input", "as_profile", optional=True, max_chars=60)
field("business-reg", "03 (03) ii", L("Business registration number", "ලියාපදිංචි අංකය", "பதிவு இலக்கம்"),
      0, on_line(0.37, 0.83, 0.470), "text", None, "input", "en", optional=True, max_chars=30)
field("business-income", "03 (03) iii", L("Monthly/annual business income", "ව්‍යාපාරයෙන් මාසික/වාර්ෂික ආදායම",
      "வணிக மாத/வருட வருமானம்"), 0, on_line(0.445, 0.83, 0.489), "text", None, "input", "en", optional=True, max_chars=30)
for i, (fid, en, si, ta, y) in enumerate([
    ("total-employment", "Employment (Rs)", "රැකියාවෙන් (රු.)", "வேலை (ரூ.)", 0.536),
    ("total-land", "Land and property (Rs)", "ඉඩම් දේපල වලින් (රු.)", "காணி, சொத்து (ரூ.)", 0.554),
    ("total-business", "Business (Rs)", "ව්‍යාපාර වලින් (රු.)", "வணிகம் (ரூ.)", 0.571),
    ("total-other", "Other (Rs)", "වෙනත් (රු.)", "பிற (ரூ.)", 0.588),
]):
    field(fid, f"04 {['i', 'ii', 'iii', 'iv'][i]}", L(en, si, ta), 0, on_line(0.475, 0.65, y), "text", None, "input", "en",
          optional=True, max_chars=16)
field("total-income", "04", L("Total monthly/annual income (Rs)", "මුළු එකතුව (රු.)", "மொத்த வருமானம் (ரூ.)"),
      0, on_line(0.475, 0.65, 0.627), "text", None, "input", "en", max_chars=16,
      hint=L("Add up all your income. The Grama Niladhari will check it.",
             "ඔබේ සියලු ආදායම් එකතු කරන්න. ග්‍රාම නිලධාරී එය පරීක්ෂා කරයි.",
             "உங்கள் எல்லா வருமானத்தையும் கூட்டுங்கள். கிராம அலுவலர் சரிபார்ப்பார்."))
field("welfare-number", "05", L("Welfare / Samurdhi number (if any)", "සහනාධාර / සමෘද්ධි අංකය (ඇත්නම්)",
      "நலன்புரி / சமுர்த்தி இலக்கம் (இருந்தால்)"), 0, on_line(0.17, 0.3, 0.675), "text", None, "input", "en",
      optional=True, max_chars=16)
field("welfare-amount", "05", L("Welfare amount (Rs)", "දීමනාව (රු.)", "உதவித் தொகை (ரூ.)"),
      0, on_line(0.36, 0.5, 0.675), "text", None, "input", "en", optional=True, max_chars=12)
field("purpose", "06", L("Why you need it and where you will submit it", "අවශ්‍ය වන කාරණය සහ ඉදිරිපත් කරන ස්ථානය",
      "தேவைக்கான காரணமும் சமர்ப்பிக்கும் இடமும்"), 0, box(0.12, 0.709, 0.86, 0.768), "multiline", "purpose", "confirm",
      "si", max_chars=160, font=11)
field("date", None, L("Date", "දිනය", "திகதி"), 0, on_line(0.175, 0.34, 0.870), "date", "today", "auto", "en", font=10.5)
field("applicant-nic", None, L("NIC number (next to your signature)", "හැඳුනුම්පත් අංකය (අත්සන අසල)",
      "அடையாள அட்டை இலக்கம் (கையொப்பத்தின் அருகில்)"), 0, box(0.66, 0.873, 0.82, 0.889), "nic", "nic", "auto", "en", font=9.5)
field("applicant-signature", None, L("Your signature", "ඔබේ අත්සන", "உங்கள் கையொப்பம்"), 0,
      box(0.565, 0.873, 0.655, 0.893), "signature", None, "manual",
      hint=L("Sign here in front of the Grama Niladhari.", "ග්‍රාම නිලධාරී ඉදිරියේ මෙහි අත්සන් කරන්න.",
             "கிராம அலுவலர் முன்னிலையில் இங்கே கையொப்பமிடுங்கள்."))

# ---- Page 2: officers only ----------------------------------------------------------
field("gn-recommendation", None, L("Grama Niladhari's recommendation", "ග්‍රාම නිලධාරී නිර්දේශය", "கிராம அலுவலரின் பரிந்துரை"),
      1, box(0.11, 0.09, 0.9, 0.36), "multiline", None, "officer")
field("ds-subject-officer", None, L("Divisional Secretariat: subject officer", "ප්‍රාදේශීය ලේකම් කාර්යාලය: විෂය ලිපිකරු",
      "பிரதேச செயலகம்: பாட உத்தியோகத்தர்"), 1, box(0.11, 0.38, 0.9, 0.62), "multiline", None, "officer")
field("ds-approval", None, L("Divisional Secretary's approval and fee receipt", "ප්‍රාදේශීය ලේකම් අනුමැතිය සහ ගාස්තු රිසිට්පත",
      "பிரதேச செயலாளர் அனுமதியும் கட்டணப் பற்றுச்சீட்டும்"), 1, box(0.11, 0.64, 0.9, 0.95), "multiline", None, "officer")

form_map = {
    "id": "imbulpe-ds-income-certificate-request",
    "code": "DS/IC (Imbulpe)",
    "name": L("Request for an Income Certificate", "ආදායම් සහතිකයක් ඉල්ලීම", "வருமானச் சான்றிதழ் கோரிக்கை"),
    "procedureIds": ["income-certificate"],
    "pdfPath": "data/forms/imbulpe-ds-income-certificate-request/official.pdf",
    "pageCount": 2,
    "pageSizes": [{"width": 595.2, "height": 841.68}, {"width": 595.2, "height": 841.68}],
    "verifiedYear": 2026,
    "language": ["si"],
    "fields": F,
    "sources": [{
        "id": "imbulpe-ds-income-form",
        "title": "Income certificate application form, Divisional Secretariat Imbulpe (Ratnapura District)",
        "url": "http://imbulpe.ds.gov.lk/images/service_cluster_pdf/certificate_issuing/income-certificate.pdf",
        "kind": "form",
        "publisher": "Divisional Secretariat, Imbulpe",
        "retrievedAt": "2026-11-24",
    }],
    "verification": {
        "status": "approved",
        "sourceRef": "imbulpe-ds-income-form",
        "verifiedBy": "ByteMe research team (pending Kuruwita DS officer review)",
        "verifiedAt": "2026-11-24",
        "demoData": True,
    },
}
out = pathlib.Path(sys.argv[1])
out.write_text(json.dumps(form_map, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("fields:", len(F))
