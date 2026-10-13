; NSIS sets the shared dialog class icon, but leaves the window's small icon
; unset. Set both window icons explicitly so the caption cannot inherit a
; system dialog icon. Resource 103 is NSIS's MUI_ICON / MUI_UNICON group.
!macro NexletWindowIcons UNINSTALLER_PREFIX
Function ${UNINSTALLER_PREFIX}NexletSetWindowIcons
  Push $0
  Push $1
  Push $2
  Push $3
  System::Call 'kernel32::GetModuleHandleW(p 0) p .r0'

  ; Small caption icon at the current system size (SM_CXSMICON/SM_CYSMICON).
  System::Call 'user32::GetSystemMetrics(i 49) i .r1'
  System::Call 'user32::GetSystemMetrics(i 50) i .r2'
  System::Call 'user32::LoadImageW(p r0, p 103, i 1, i r1, i r2, i 0x8000) p .r3'
  StrCmp $3 0 +2
    SendMessage $HWNDPARENT 0x80 0 $3 ; WM_SETICON, ICON_SMALL

  ; Large window/task-switcher icon (SM_CXICON/SM_CYICON).
  System::Call 'user32::GetSystemMetrics(i 11) i .r1'
  System::Call 'user32::GetSystemMetrics(i 12) i .r2'
  System::Call 'user32::LoadImageW(p r0, p 103, i 1, i r1, i r2, i 0x8000) p .r3'
  StrCmp $3 0 +2
    SendMessage $HWNDPARENT 0x80 1 $3 ; WM_SETICON, ICON_BIG

  ; LR_SHARED keeps the resource handles alive for the process lifetime.
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!macroend

; electron-builder compiles the uninstaller separately; emitting un.* code
; in the installer pass causes NSIS warning 6020 (treated as an error).
!ifdef BUILD_UNINSTALLER
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.NexletSetWindowIcons
  !insertmacro NexletWindowIcons "un."
!else
  !define MUI_CUSTOMFUNCTION_GUIINIT NexletSetWindowIcons
  !insertmacro NexletWindowIcons ""
!endif
