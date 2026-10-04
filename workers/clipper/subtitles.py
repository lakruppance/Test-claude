"""Word-by-word burned-in subtitles as an ASS script (rendered by libass through FFmpeg)."""

from __future__ import annotations

from dataclasses import dataclass

from .models import Word

WIDTH, HEIGHT = 1080, 1920

# TikTok overlays its UI on the bottom ~20% (caption, music) and the right edge (like, comment,
# share buttons). Text stays above the bottom zone and further from the right edge than the left.
SAFE_BOTTOM = int(HEIGHT * 0.28)
SAFE_TOP = int(HEIGHT * 0.13)
MARGIN_LEFT = 90
MARGIN_RIGHT = 170
HOLD_SECONDS = 0.6


def ass_color(hex_rgb: str, alpha: int = 0) -> str:
    """'#RRGGBB' + alpha (0 opaque .. 255 transparent) -> ASS '&HAABBGGRR'."""
    h = hex_rgb.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


@dataclass(frozen=True)
class CaptionStyle:
    key: str
    font: str
    size: int
    primary: str  # inactive words
    active: str  # word being spoken
    outline_color: str
    outline: float
    shadow: float
    border_style: int  # 1 = outline + shadow, 3 = opaque box
    back_color: str
    uppercase: bool
    max_words: int
    max_chars: int
    inactive_alpha: int = 0


STYLES: dict[str, CaptionStyle] = {
    # Large uppercase words, thick outline, active word in yellow.
    "impact": CaptionStyle(
        key="impact", font="Poppins ExtraBold", size=88,
        primary=ass_color("#FFFFFF"), active=ass_color("#FFD60A"),
        outline_color=ass_color("#111111"), outline=7, shadow=0, border_style=1,
        back_color=ass_color("#000000", 255), uppercase=True, max_words=3, max_chars=18,
    ),
    # Sentence case on one translucent box per line (BorderStyle 4, a libass extension),
    # active word in green.
    "boite": CaptionStyle(
        key="boite", font="Poppins", size=66,
        primary=ass_color("#FFFFFF"), active=ass_color("#3DDC84"),
        outline_color=ass_color("#000000", 90), outline=14, shadow=0, border_style=4,
        back_color=ass_color("#000000", 90), uppercase=False, max_words=4, max_chars=24,
    ),
    # Quiet style: smaller text, inactive words dimmed, soft shadow.
    "epure": CaptionStyle(
        key="epure", font="Poppins SemiBold", size=66,
        primary=ass_color("#FFFFFF"), active=ass_color("#FFFFFF"),
        outline_color=ass_color("#000000", 60), outline=2.5, shadow=3, border_style=1,
        back_color=ass_color("#000000", 100), uppercase=False, max_words=5, max_chars=30,
        inactive_alpha=80,
    ),
}


def _ts(seconds: float) -> str:
    seconds = max(seconds, 0.0)
    cs = int(round(seconds * 100))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", " ")


def group_words(words: list[Word], max_words: int, max_chars: int) -> list[list[Word]]:
    """Short groups that break at punctuation, long pauses and length limits."""
    groups: list[list[Word]] = []
    current: list[Word] = []
    for w in words:
        if current:
            chars = sum(len(x.text) + 1 for x in current) + len(w.text)
            pause = w.start - current[-1].end > 0.5
            if len(current) >= max_words or chars > max_chars or pause:
                groups.append(current)
                current = []
        current.append(w)
        if w.text.endswith((".", "?", "!", ",", ";", ":", "…")):
            groups.append(current)
            current = []
    if current:
        groups.append(current)
    return groups


def build_ass(
    words: list[Word],
    clip_start: float,
    clip_end: float,
    style_key: str = "impact",
    hook_text: str = "",
    hook_seconds: float = 4.0,
) -> str:
    """Words carry absolute times; output times are relative to clip_start."""
    style = STYLES[style_key]
    inside = [
        Word(text=w.text, start=w.start - clip_start, end=w.end - clip_start,
             confidence=w.confidence)
        for w in words
        if w.end > clip_start and w.start < clip_end
    ]
    duration = clip_end - clip_start

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {WIDTH}
PlayResY: {HEIGHT}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, \
Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, \
Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{style.font},{style.size},{style.primary},{style.active},{style.outline_color},\
{style.back_color},-1,0,0,0,100,100,0,0,{style.border_style},{style.outline},{style.shadow},2,\
{MARGIN_LEFT},{MARGIN_RIGHT},{SAFE_BOTTOM},1
Style: Hook,Poppins ExtraBold,64,{ass_color("#111111")},{ass_color("#111111")},\
{ass_color("#FFFFFF")},{ass_color("#FFFFFF")},-1,0,0,0,100,100,0,0,3,18,0,8,\
{MARGIN_LEFT},{MARGIN_RIGHT},{SAFE_TOP},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines: list[str] = []
    if hook_text.strip():
        hook = _escape(hook_text.strip())
        lines.append(
            f"Dialogue: 1,{_ts(0)},{_ts(min(hook_seconds, duration))},Hook,,0,0,0,,"
            f"{{\\fad(150,250)}}{hook}"
        )

    groups = group_words(inside, style.max_words, style.max_chars)
    for g, group in enumerate(groups):
        # Hold a group on screen until the next one starts when the pause is short, so captions
        # don't flicker off between groups; clear the screen during real silences.
        next_start = groups[g + 1][0].start if g + 1 < len(groups) else duration
        group_end = min(next_start, group[-1].end + HOLD_SECONDS)
        for i, word in enumerate(group):
            start = word.start if i else max(group[0].start, 0)
            end = group[i + 1].start if i + 1 < len(group) else group_end
            if end <= start:
                continue
            parts = []
            for j, w in enumerate(group):
                text = _escape(w.text.upper() if style.uppercase else w.text)
                if j == i:
                    parts.append(f"{{\\1c{style.active}\\1a&H00&}}{text}")
                else:
                    parts.append(
                        f"{{\\1c{style.primary}\\1a&H{style.inactive_alpha:02X}&}}{text}"
                    )
            lines.append(
                f"Dialogue: 0,{_ts(start)},{_ts(min(end, duration))},Caption,,0,0,0,,"
                + " ".join(parts)
            )
    return header + "\n".join(lines) + "\n"
