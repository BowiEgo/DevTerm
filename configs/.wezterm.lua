-- WezTerm configuration
-- https://wezfurlong.org/wezterm/config/files.html

local wezterm = require("wezterm")

return {
	font_size = 13.0,
	color_scheme = "Catppuccin Mocha",

	-- Tab bar
	use_fancy_tab_bar = false,
	hide_tab_bar_if_only_one_tab = true,

	-- Window
	window_padding = { left = 8, right = 8, top = 8, bottom = 8 },
	window_decorations = "RESIZE",

	default_prog = { "__DEFAULT_SHELL__" },
}
