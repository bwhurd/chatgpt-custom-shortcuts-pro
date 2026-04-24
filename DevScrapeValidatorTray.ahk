#NoEnv
#SingleInstance Force
#Persistent
SetBatchLines, -1
SetWorkingDir, %A_ScriptDir%
SetTitleMatchMode, 2

psExe := A_WinDir "\System32\WindowsPowerShell\v1.0\powershell.exe"
startPs := A_ScriptDir "\StartDevScrapeValidator.ps1"
stopPs := A_ScriptDir "\StopDevScrapeValidator.ps1"
openLatestPs := A_ScriptDir "\OpenLatestDevScrapeReport.ps1"
launcherTitle := "CGCSP DevScrape Validator"
trayIconPath := A_ScriptDir "\tests\ChatGPT Custom Shortcuts Pro.ico"

if !FileExist(startPs) {
    MsgBox, 16, DevScrape Validator Tray, Could not find StartDevScrapeValidator.ps1 in %A_ScriptDir%.
    ExitApp
}

if !FileExist(stopPs) {
    MsgBox, 16, DevScrape Validator Tray, Could not find StopDevScrapeValidator.ps1 in %A_ScriptDir%.
    ExitApp
}

if !FileExist(psExe) {
    MsgBox, 16, DevScrape Validator Tray, Could not find powershell.exe in %A_WinDir%\System32\WindowsPowerShell\v1.0.
    ExitApp
}

Menu, Tray, NoStandard
Menu, Tray, Add, Start DevScrape Validator, StartValidator
Menu, Tray, Add, Open Latest Report, OpenLatestReport
Menu, Tray, Add, Shutdown DevScrape Validator, ShutdownValidator
Menu, Tray, Add
Menu, Tray, Add, Reload Tray, ReloadTray
Menu, Tray, Add, Shutdown and Exit Tray, ShutdownAndExitTray
Menu, Tray, Tip, DevScrape Validator: checking status...
if FileExist(trayIconPath)
    Menu, Tray, Icon, %trayIconPath%
Menu, Tray, Click, 1
OnMessage(0x404, "TrayMsg")
OnMessage(0x212, "ExitMenuLoop")

Gosub, UpdateState
return

TrayMsg(wParam, lParam, msg, hwnd) {
    if (lParam = 0x203) {
        SetTrayWorking("DevScrape Validator: opening controller...")
        RunStartScript()
        SetTimer, UpdateAfterInteraction, -250
    } else if (lParam = 0x205) {
        SetTimer, UpdateAfterInteraction, -250
    }
}

ExitMenuLoop(wParam, lParam, msg, hwnd) {
    SetTimer, UpdateAfterInteraction, -250
}

StartValidator:
    SetTrayWorking("DevScrape Validator: starting...")
    RunStartScript()
    SetTimer, UpdateAfterInteraction, -500
return

OpenLatestReport:
    SetTrayWorking("DevScrape Validator: opening latest report...")
    exitCode := RunPowerShellHelper(openLatestPs, output)
    if (exitCode != 0) {
        ShowError(output)
    }
    Gosub, UpdateState
return

ShutdownValidator:
    SetTrayWorking("DevScrape Validator: shutting down...")
    StopValidatorProcesses()
    Sleep, 500
    Gosub, UpdateState
return

ReloadTray:
    Reload
return

ShutdownAndExitTray:
    Gosub, ShutdownValidator
    Sleep, 400
    ExitApp
return

UpdateAfterInteraction:
    Gosub, UpdateState
return

UpdateState:
    running := IsValidatorRunning()
    if (running) {
        Menu, Tray, Tip, DevScrape Validator: running
        Menu, Tray, Enable, Open Latest Report
        Menu, Tray, Enable, Shutdown DevScrape Validator
    } else {
        Menu, Tray, Tip, DevScrape Validator: stopped
        Menu, Tray, Enable, Open Latest Report
        Menu, Tray, Disable, Shutdown DevScrape Validator
    }
return

SetTrayWorking(tipText) {
    Menu, Tray, Tip, %tipText%
}

RunStartScript() {
    global psExe, startPs
    Run, "%psExe%" -NoProfile -Sta -ExecutionPolicy Bypass -WindowStyle Hidden -File "%startPs%", %A_ScriptDir%, Hide
}

StopValidatorProcesses() {
    global psExe, stopPs
    RunWait, "%psExe%" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%stopPs%", %A_ScriptDir%, Hide
}

GetValidatorProcessCounts(ByRef launcherCount, ByRef runCount) {
    root := A_ScriptDir
    launcherCount := 0
    runCount := 0
    wmi := ComObjGet("winmgmts:")
    processes := wmi.ExecQuery("SELECT ProcessId, CommandLine FROM Win32_Process")

    for process in processes {
        commandLine := process.CommandLine
        if (commandLine = "")
            continue

        if !InStr(commandLine, root)
            continue

        if InStr(commandLine, "StartDevScrapeValidator.ps1")
            launcherCount += 1
        else if (InStr(commandLine, "run-devscrape-validation.ps1")
            || (InStr(commandLine, "devscrape-wide.mjs") && InStr(commandLine, "--action validate-wide")))
            runCount += 1
    }
}

IsValidatorRunning() {
    GetValidatorProcessCounts(launcherCount, runCount)
    return ((launcherCount + runCount) > 0)
}

RunPowerShellHelper(scriptPath, ByRef output) {
    global psExe
    tempFile := A_Temp "\cgcsp-devscrape-tray-" A_TickCount ".txt"
    output := ""
    RunWait, %ComSpec% /C ""%psExe%" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%scriptPath%" > "%tempFile%" 2>&1", %A_ScriptDir%, Hide UseErrorLevel
    exitCode := ErrorLevel
    FileRead, output, %tempFile%
    FileDelete, %tempFile%
    return exitCode
}

ShowError(output) {
    message := output
    if (message = "")
        message := "The requested helper failed."
    MsgBox, 16, DevScrape Validator Tray, %message%
}
