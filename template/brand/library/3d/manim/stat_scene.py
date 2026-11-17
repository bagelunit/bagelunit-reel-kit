# Manim sample in the Print look: a number counting up while a bar grows. Vertical 1080x1920.
#   manim -qh --fps 30 stat_scene.py StatScene -o stat-sample.mp4   (the installer's Manim step puts manim in ~/.config/bagelunit-reels/manim-venv/bin)
# Fonts: the kit's Anton. Colours: the brand's (brand/brand.json), else paper #FBF5E6, ink #15110E, vermilion #E23B2E.
from manim import *
config.pixel_width, config.pixel_height, config.frame_height, config.frame_width = 1080, 1920, 16, 9
import json, pathlib, re
def _brand():
    d = {"background": "FBF5E6", "ink": "15110E", "accent": "E23B2E"}
    try:
        c = json.loads((pathlib.Path(__file__).resolve().parents[3] / "brand.json").read_text()).get("colors", {})
        for k in d:
            h = str(c.get(k) or "").lstrip("#")
            if re.fullmatch(r"[0-9A-Fa-f]{6}", h): d[k] = h
    except Exception: pass
    return d
_B = _brand()
config.background_color = "#" + _B["background"]
INK, RED = "#" + _B["ink"], "#" + _B["accent"]

ANTON = str(pathlib.Path.home() / ".claude/skills/bagelunit-reels/fonts/Anton-Regular.ttf")

class StatScene(Scene):
    def construct(self):
        with register_font(ANTON):
            self._build()

    def _build(self):
        title = Text("SAMPLE STAT", font="Anton", color=INK, font_size=84).move_to(UP * 5.4)
        label = Text("PER VIOLATION", font="Anton", color=RED, font_size=52).move_to(UP * 1.8)
        bar_bg = RoundedRectangle(corner_radius=0.15, width=7, height=0.6, color=INK, stroke_width=6).move_to(DOWN * 1.4)
        bar = Rectangle(width=0.01, height=0.5, fill_color=RED, fill_opacity=1, stroke_width=0).move_to(bar_bg.get_left() + RIGHT * 0.05, aligned_edge=LEFT)
        v = ValueTracker(0)   # Text, not Integer: Integer needs LaTeX, which is not installed
        num = always_redraw(lambda: Text(f"${int(v.get_value()):,}", font="Anton", color=INK, font_size=150).move_to(UP * 0.1))
        self.play(FadeIn(title, shift=DOWN * 0.3), run_time=0.5)
        self.play(Create(bar_bg), FadeIn(label), run_time=0.5)
        self.add(bar, num)
        self.play(v.animate(rate_func=rush_into, run_time=2.2).set_value(53088),
                  bar.animate.stretch_to_fit_width(6.9, about_edge=LEFT).set_x(bar_bg.get_left()[0] + 3.5 + 0.05), run_time=2.2)
        self.play(Flash(num, color=RED, flash_radius=2.2, line_length=0.5, run_time=0.4))
        self.wait(0.8)
