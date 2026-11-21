-- acasa's kiosk session: xmonad with one job, keeping the dashboard (Chrome on the acasa page)
-- full screen and in focus. Linked from ~/.config/xmonad/xmonad.hs by the setup script.
--   workspace 1: the dashboard, nothing else. Every other window opens on workspace 2,
--   so nothing takes the focus away from the page; mod-2 goes there, mod-1 comes back.
--   mod = the Super (Windows) key. mod-shift-enter: a terminal (on 2). mod-shift-r: the dashboard again.
import XMonad
import XMonad.Hooks.EwmhDesktops (ewmh, ewmhFullscreen)
import XMonad.Hooks.ManageHelpers (isDialog, doCenterFloat)
import XMonad.Layout.NoBorders (noBorders)
import XMonad.Util.EZConfig (additionalKeysP)
import XMonad.Util.SpawnOnce (spawnOnce)

kiosk :: String
kiosk = "$HOME/repo/acasa/kiosk/kiosk.sh"

isChrome :: Query Bool
isChrome = className =? "Google-chrome"

main :: IO ()
main = xmonad . ewmhFullscreen . ewmh $ def
  { modMask            = mod4Mask
  , terminal           = "xterm"
  , borderWidth        = 0
  , workspaces         = ["1", "2"]
  , focusFollowsMouse  = False
  , clickJustFocuses   = False
  , layoutHook         = noBorders Full ||| Tall 1 (3 / 100) (1 / 2)
  , manageHook         = composeAll
      [ isDialog --> doCenterFloat
      , fmap not isChrome --> doShift "2"
      ]
  , startupHook        = spawnOnce kiosk
  } `additionalKeysP`
  [ ("M-S-r", spawn (kiosk ++ " restart"))
  ]
