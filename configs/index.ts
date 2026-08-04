// Config template files — bundled at build time.
// Edit the files in configs/ then rebuild.

export const weztermLua = `-- WezTerm configuration
-- https://wezfurlong.org/wezterm/config/files.html

local wezterm = require("wezterm")

return {
\tfont_size = 13.0,
\tcolor_scheme = "Catppuccin Mocha",

\t-- Tab bar
\tuse_fancy_tab_bar = false,
\thide_tab_bar_if_only_one_tab = true,

\t-- Window
\twindow_padding = { left = 8, right = 8, top = 8, bottom = 8 },
\twindow_decorations = "RESIZE",

\tdefault_prog = { "__DEFAULT_SHELL__" },
}
`;

export const herdrToml = `# herdr configuration
# https://herdr.dev/docs/configuration/

[shell]
command = "__DEFAULT_SHELL__"

[ui]
theme = "dark"
`;
