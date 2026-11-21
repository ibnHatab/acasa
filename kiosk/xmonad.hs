-- acasa's kiosk session on the nuc: taycann's ~/.xmonad/xmonad.hs (copied 2026-11-21), changed only where marked "acasa:".
--   acasa: the dashboard (Chrome on the acasa page) lives on workspace 1.con; every other new window opens on
--   2.dev, so nothing takes the focus from the page (win-2 goes there, win-1 comes back).
--   acasa: win-shift-r opens the dashboard again.
{-# OPTIONS_GHC -Wno-deprecations #-}

module Main (main) where

import qualified Data.Map as M

import XMonad hiding ( (|||) )
import qualified XMonad.StackSet as W

import XMonad.Actions.CycleWS
import XMonad.Actions.PhysicalScreens
import XMonad.Hooks.DynamicLog hiding (xmobar)
import XMonad.Hooks.ManageDocks
import XMonad.Hooks.ServerMode
import XMonad.Layout.Accordion
import XMonad.Layout.LayoutCombinators
import XMonad.Layout.Magnifier
import XMonad.Layout.NoBorders
import XMonad.Layout.SimpleFloat
import XMonad.Layout.Tabbed
import XMonad.Layout.WindowArranger
import XMonad.Layout.ThreeColumns
import XMonad.Prompt
import XMonad.Prompt.Shell
import XMonad.Prompt.Ssh
import XMonad.Prompt.Theme
import XMonad.Prompt.Window
import XMonad.Prompt.XMonad
import XMonad.Util.Run
import XMonad.Util.Themes
import XMonad.Hooks.SetWMName
import XMonad.Util.SpawnOnce (spawnOnce)   -- acasa

main = do
  xmobar <- spawnPipe "xmobar -x 0"   -- acasa: one screen (taycann: -x 2)
  xmonad $ docks $ def
         { workspaces         = ["1.con", "2.dev", "3.web", "4.doc", "5.mail"] ++
                                map show [6 .. 9 :: Int]
         , logHook            = myDynLog xmobar -- REMOVE this line if you do not have xmobar installed!
         , modMask            = mod4Mask
         , startupHook        = setWMName "LG3D" <+> spawnOnce kiosk   -- acasa: the service and the dashboard
         , manageHook         = myManageHooks
         , layoutHook         = avoidStrutsOn [U,L] $
                                mytabs        |||
                                -- noBorders mytabs |||
                                otherLays
         , terminal           = "terminator"
         , normalBorderColor  = "white"
         , focusedBorderColor = "red"
         , keys               = newKeys
         , handleEventHook    = serverModeEventHook
         , focusFollowsMouse  = True
         }
    where
      -- layouts
      mytabs    =       tabbed shrinkText (theme smallClean)
      -- decorated = simpleFloat' shrinkText (theme smallClean)
      tiled     = Tall 1 (3/100) (1/2)
      otherLays = windowArrange   $
                  --  magnifier tiled |||
                  --                  noBorders Full  -- |||
                  tiled 
                  -- ||| tiled
      -- ||| ThreeCol 1 (3/100) (1/2) ||| ThreeColMid 1 (3/100) (1/2)
      -- ||| Accordion

      myManageHooks = composeAll
                      [ isDashboard --> doShift "1.con"            -- acasa: the page is workspace 1's, wherever you are
                      , fmap not isDashboard --> doShift "2.dev"   -- acasa: everything else opens on 2: the page keeps the focus
                      , className =? "Do"      --> doFloat
                      , className =? "Gimp"      --> doFloat
                      , className =? "XTerm"      --> doFloat
                      , className =? "Xmessage"  --> doFloat
                      , className =? "Iceweasel"  --> doFloat
                      , className =? "matplotlib" --> doShift "1.con"
                      , className =? "Matplotlib" --> doShift "1.con"
                      , className =? "gksqt" --> doShift "1.con"
                      , className =? "Julia" --> doShift "1.con"
                      , className =? "Electron" --> doShift "1.con"
                      , className =? "Open3D" --> doShift "1.con"
--                      , className =? "matplotlib" --> doFloat
                      , className =? "HWP Supervisor" --> doShift "6"
                      , className =? "Makie"  --> doFloat
                      , className =? "Rhythmbox" --> doShift "8:rth"
                      ]

      -- acasa: the kiosk script and the windows that are the dashboard's (Chrome's own: the page, its dialogs)
      kiosk       = "$HOME/repo/acasa/kiosk/kiosk.sh"
      isDashboard = className =? "Google-chrome"

      -- xmobar
      myDynLog    h = dynamicLogWithPP def
                      { ppCurrent = xmobarColor "yellow" "" . wrap "[" "]"
                      , ppTitle   = xmobarColor "green"  "" . shorten 40
                      , ppVisible = xmobarColor "green" "" . wrap "(" ")"
                      , ppOutput  = hPutStrLn h
                      }

      -- key bindings stuff
      defKeys    = keys def
      delKeys x  = foldr M.delete           (defKeys x) (toRemove x)
      newKeys x  = foldr (uncurry M.insert) (delKeys x) (toAdd    x)
      -- remove some of the default key bindings
      toRemove x =
          [
                        -- (modMask x              , xK_j)

          -- , (modMask x              , xK_k)
          -- , (modMask x              , xK_p)
          --, (modMask x .|. shiftMask, xK_p)
          (modMask x .|. shiftMask, xK_q)
          , (modMask x              , xK_q)
          ]
      -- I want modMask .|. shiftMask 1-9 to be free!
--          [(shiftMask .|. modMask x, k) | k <- [xK_1 .. xK_9]]
      -- These are my personal key bindings
      toAdd x   =
          [ ((modMask x .|. shiftMask, xK_r     ), spawn (kiosk ++ " restart"))   -- acasa: the dashboard again
          , ((modMask x              , xK_F12   ), xmonadPrompt      def     )
          , ((modMask x              , xK_F3    ), shellPrompt       def     )
          , ((modMask x              , xK_F4    ), sshPrompt         def     )
          , ((modMask x              , xK_F5    ), themePrompt       def     )
          , ((modMask x              , xK_F6    ), windowPrompt def Goto  allWindows)   -- acasa: xmonad-contrib 0.18 (taycann 0.17: windowPromptGoto)
          , ((modMask x              , xK_F7    ), windowPrompt def Bring allWindows)   -- acasa: (taycann: windowPromptBring)
          , ((modMask x              , xK_comma ), prevWS                                )
          , ((modMask x              , xK_period), nextWS                                )
          --, ((modMask x              , xK_Right ), windows W.focusDown                   )
          --, ((modMask x              , xK_Left  ), windows W.focusUp                     )
          -- other stuff: launch some useful utilities
          -- , ((modMask x              , xK_F2    ), spawn "gedit ~/scratchpad.txt" )
          -- , ((modMask x .|. shiftMask, xK_F4    ), spawn "~/bin/dict.sh"                 )
          , ((modMask x .|. shiftMask, xK_F5    ), spawn "xterm -e /bin/bash -l -c /opt/xsel-to-image/bin/xsel-to-image.sh")
          , ((modMask x .|. shiftMask, xK_F12    ), spawn "sudo systemctl suspend")
            -- softfone shortcuts
          , ((modMask x, xK_KP_Multiply), spawn "twinkle --cmd answer")
          , ((modMask x, xK_KP_Subtract),    spawn "twinkle --cmd bye")
          , ((modMask x, xK_KP_Divide),   spawn "twinkle --cmd 'call 8012'")
          -- xsel-to-speech removed: freed Super+Shift+s (s-S) for Emacs treemacs
          , ((modMask x              , xK_c     ), kill                                  )
          , ((modMask x .|. shiftMask, xK_comma ), sendMessage (IncMasterN   1 )         )
          , ((modMask x .|. shiftMask, xK_period), sendMessage (IncMasterN (-1))         )
          -- commands fo the Magnifier layout
          , ((modMask x .|. controlMask              , xK_plus ), sendMessage MagnifyMore)
          , ((modMask x .|. controlMask              , xK_minus), sendMessage MagnifyLess)
          , ((modMask x .|. controlMask              , xK_o    ), sendMessage ToggleOff  )
          , ((modMask x .|. controlMask .|. shiftMask, xK_o    ), sendMessage ToggleOn   )
          -- windowArranger
          , ((modMask x .|. controlMask              , xK_a    ), sendMessage  Arrange           )
          , ((modMask x .|. controlMask .|. shiftMask, xK_a    ), sendMessage  DeArrange         )
          , ((modMask x .|. controlMask              , xK_Left ), sendMessage (DecreaseLeft   10))
          , ((modMask x .|. controlMask              , xK_Up   ), sendMessage (DecreaseUp     10))
          , ((modMask x .|. controlMask              , xK_Right), sendMessage (IncreaseRight  10))
          , ((modMask x .|. controlMask              , xK_Down ), sendMessage (IncreaseDown   10))
          -- gaps
          , ((modMask x                              , xK_b    ), sendMessage  ToggleStruts      )
          , ((modMask x                              , xK_KP_Enter), windows W.swapMaster)
          ] ++
          -- Use modMask .|. shiftMask .|. controlMask 1-9 instead
          -- [( (m .|. modMask x, k), windows $ f i)
          --  | (i, k) <- zip (workspaces x) [xK_1 .. xK_9]
          -- ,  (f, m) <- [(W.greedyView, 0), (W.shift, shiftMask .|. controlMask)]
          -- ]  ++
--          [((m .|. mod4Mask .|. shiftMask, key), screenWorkspace sc >>= flip whenJust (windows . f))
--          | (key, sc) <- zip [xK_Right, xK_Left] [0,1] -- was [0..]
--          , (f, m) <- [(W.view, 0), (W.shift, shiftMask)]] ++
--
--          [((m .|. mod4Mask, key), screenWorkspace sc >>= flip whenJust (windows . f))
--          | (key, sc) <- zip [xK_q, xK_w] [1,0] -- was [0..]
--          , (f, m) <- [(W.view, 0), (W.shift, shiftMask)]]
        
          -- monitors addressed by physical position (P 0 = leftmost), so the
          -- bindings do not depend on xrandr output numbering
          -- win-q / win-w / win-e: focus left / middle / right monitor
          [((mod4Mask, key), viewScreen def sc)
          | (key, sc) <- zip [xK_q, xK_w, xK_e] [P 0, P 1, P 2]] ++
          -- win-shift-q / w / e: move focused window to left / middle / right monitor
          [((mod4Mask .|. shiftMask, key), sendToScreen def sc)
          | (key, sc) <- zip [xK_q, xK_w, xK_e] [P 0, P 1, P 2]] ++
          -- win-shift-left / win-shift-right: move window to leftmost / rightmost monitor
          [((mod4Mask .|. shiftMask, key), sendToScreen def sc)
          | (key, sc) <- zip [xK_Left, xK_Right] [P 0, P 2]]
