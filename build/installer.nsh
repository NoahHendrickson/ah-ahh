; When updating, the installer first runs the old version's uninstaller. On some PCs it exits
; with code 2 even though no ah ahh files are in use, and the stock handler then aborts the
; update ("Failed to uninstall old application files"). Install over the old files instead.
!macro customUnInstallCheck
  ${if} $R0 != 0
    DetailPrint "Old uninstaller exited with code $R0; installing over the old files."
  ${endIf}
  ClearErrors
!macroend
