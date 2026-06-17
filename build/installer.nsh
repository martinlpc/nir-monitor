!macro customInstall
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
!macroend
