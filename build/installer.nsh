!include key.nsh

!macro customInstall
  ; ──────────────────────────────────────────────
  ; NIR_DB_ENCRYPTION_KEY — persistente a nivel de máquina
  ; ──────────────────────────────────────────────
  WriteRegStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" \
    "NIR_DB_ENCRYPTION_KEY" "${NIR_DB_ENCRYPTION_KEY}"
  ; Setear en el entorno actual para que el auto-arranque post-instal lo herede
  System::Call 'kernel32::SetEnvironmentVariable(t "NIR_DB_ENCRYPTION_KEY", t "${NIR_DB_ENCRYPTION_KEY}")'
  ; Notificar al sistema
  SendMessage 0xFFFF 0x001A 0 "STR:Environment"

  ; ──────────────────────────────────────────────
  ; FTDI driver check & install (via pnputil)
  ; ──────────────────────────────────────────────
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\ftdibus" "DisplayName"
  ${If} $0 == ""
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "El NBM-550 necesita drivers FTDI.$\n¿Desea instalarlos ahora?" \
      /SD IDYES IDNO skip_ftdi
    SetDetailsPrint both
    DetailPrint "Instalando drivers FTDI..."

    nsExec::ExecToStack '"pnputil" /add-driver "$INSTDIR\resources\drivers\ftdi\ftdibus.inf" /install'
    Pop $1

    nsExec::ExecToStack '"pnputil" /add-driver "$INSTDIR\resources\drivers\ftdi\ftdiport.inf" /install'
    Pop $2

    ${If} $1 == 0
    ${AndIf} $2 == 0
      DetailPrint "✓ Drivers FTDI instalados correctamente."
    ${Else}
      DetailPrint "✗ Error al instalar drivers FTDI (código $1, $2)."
      DetailPrint "  Puede descargarlos manualmente desde:"
      DetailPrint "  https://ftdichip.com/drivers/vcp-drivers/"
    ${EndIf}
    skip_ftdi:
  ${Else}
    DetailPrint "✓ Drivers FTDI ya instalados (skip)"
  ${EndIf}

  ; ──────────────────────────────────────────────
  ; Prolific PL2303 driver check & install (via pnputil)
  ; ──────────────────────────────────────────────
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\ser2pl" "DisplayName"
  ${If} $0 == ""
    ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\PLUSB" "DisplayName"
  ${EndIf}
  ${If} $0 == ""
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "El GPS necesita drivers Prolific PL2303.$\n¿Desea instalarlos ahora?" \
      /SD IDYES IDNO skip_prolific
    SetDetailsPrint both
    DetailPrint "Instalando drivers Prolific PL2303..."

    nsExec::ExecToStack '"pnputil" /add-driver "$INSTDIR\resources\drivers\prolific\ser2pl.inf" /install'
    Pop $1

    ${If} $1 == 0
      DetailPrint "✓ Drivers Prolific instalados correctamente."
    ${Else}
      DetailPrint "✗ Error al instalar drivers Prolific (código $1)."
      DetailPrint "  Puede descargarlos manualmente desde:"
      DetailPrint "  https://www.prolific.com.tw/US/ShowProduct.aspx?p_id=225&pcid=41"
    ${EndIf}
    skip_prolific:
  ${Else}
    DetailPrint "✓ Drivers Prolific ya instalados (skip)"
  ${EndIf}

  ; ──────────────────────────────────────────────
  ; Manual de uso
  ; ──────────────────────────────────────────────
  CopyFiles "$INSTDIR\resources\manual.html" "$INSTDIR\manual.html"
  CreateShortCut "$DESKTOP\Manual de uso RNI Monitor.lnk" \
    "$INSTDIR\manual.html"

  ; ──────────────────────────────────────────────
  ; Acceso directo DEMO (modo simulación)
  ; ──────────────────────────────────────────────
  CreateShortCut "$DESKTOP\RNI Monitor (DEMO).lnk" \
    "$INSTDIR\rni-monitor.exe" \
    "--simulation" \
    "$INSTDIR\rni-monitor.exe" 0
  CreateShortCut "$SMPROGRAMS\ENACOM\RNI Monitor (DEMO).lnk" \
    "$INSTDIR\rni-monitor.exe" \
    "--simulation" \
    "$INSTDIR\rni-monitor.exe" 0

  ; ──────────────────────────────────────────────
  ; Forzar recreación del acceso directo principal (actualiza el icono)
  ; ──────────────────────────────────────────────
  Delete "$DESKTOP\RNI Monitor.lnk"
  CreateShortCut "$DESKTOP\RNI Monitor.lnk" "$INSTDIR\rni-monitor.exe" "" "$INSTDIR\rni-monitor.exe" 0
  Delete "$SMPROGRAMS\ENACOM\RNI Monitor.lnk"
  CreateShortCut "$SMPROGRAMS\ENACOM\RNI Monitor.lnk" "$INSTDIR\rni-monitor.exe" "" "$INSTDIR\rni-monitor.exe" 0

  ; ──────────────────────────────────────────────
  ; Refrescar iconos de Windows
  ; ──────────────────────────────────────────────
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  DeleteRegValue HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" \
    "NIR_DB_ENCRYPTION_KEY"
  SendMessage 0xFFFF 0x001A 0 "STR:Environment"

  Delete "$INSTDIR\manual.html"
  Delete "$DESKTOP\Manual de uso RNI Monitor.lnk"
  Delete "$DESKTOP\RNI Monitor (DEMO).lnk"
  Delete "$SMPROGRAMS\ENACOM\RNI Monitor (DEMO).lnk"
!macroend
