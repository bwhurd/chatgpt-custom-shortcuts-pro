#NoEnv
#SingleInstance Force
#Persistent
SetBatchLines, -1
SetWorkingDir, %A_ScriptDir%
SetTitleMatchMode, 2

psExe := A_WinDir "\System32\WindowsPowerShell\v1.0\powershell.exe"
projectRoot := ParentDirectory(A_ScriptDir)
startPs := A_ScriptDir "\StartDevScrapeValidator.ps1"
setupPs := A_ScriptDir "\StartDevScrapeExtensionSetup.ps1"
stopPs := A_ScriptDir "\StopDevScrapeValidator.ps1"
openLatestPs := A_ScriptDir "\OpenLatestDevScrapeReport.ps1"
openUsageReportPs := A_ScriptDir "\OpenUsageAnalyticsReport.ps1"
pushGitPs := A_ScriptDir "\PushLocalToGit.ps1"
pushGitStatusPath := projectRoot "\_temp-files\tray-git-sync\git-sync-status.txt"
pushGitPid := 0
pushGitLastStatus := ""
pushGitInProgress := 0
buildZipPy := A_ScriptDir "\RunBuildZipWithVersionBump.py"
launcherTitle := "CGCSP DevScrape Validator"
trayIconPath := A_ScriptDir "\ChatGPT Custom Shortcuts Pro.ico"

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

if !FileExist(buildZipPy) {
    MsgBox, 16, DevScrape Validator Tray, Could not find RunBuildZipWithVersionBump.py in %A_ScriptDir%.
    ExitApp
}

Menu, Tray, NoStandard
Menu, Tray, Add, Start DevScrape Validator, StartValidator
Menu, Tray, Add, Setup Extension Profile, SetupExtensionProfile
Menu, Tray, Add, Open Latest Report, OpenLatestReport
Menu, Tray, Add, Open Usage Report, OpenUsageReport
Menu, Tray, Add, Run build-zip.js, RunBuildZip
Menu, Tray, Add, Push local to git, PushLocalToGit
Menu, Tray, Add, Shutdown DevScrape Validator, ShutdownValidator
Menu, Tray, Add
Menu, Tray, Add, Reload Tray, ReloadTray
Menu, Tray, Add, Shutdown and Exit Tray, ShutdownAndExitTray
if !FileExist(pushGitPs)
    Menu, Tray, Disable, Push local to git
if !FileExist(setupPs)
    Menu, Tray, Disable, Setup Extension Profile
if !FileExist(openUsageReportPs)
    Menu, Tray, Disable, Open Usage Report
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

OpenUsageReport:
    SetTrayWorking("DevScrape Validator: opening usage report...")
    exitCode := RunPowerShellHelper(openUsageReportPs, output)
    if (exitCode != 0) {
        ShowError(output)
    }
    Gosub, UpdateState
return

SetupExtensionProfile:
    SetTrayWorking("DevScrape Validator: opening extension setup...")
    RunVisiblePowerShellHelper(setupPs)
    SetTimer, UpdateAfterInteraction, -500
return

RunBuildZip:
    SetTrayWorking("DevScrape Validator: running build-zip.js...")
    TrayTip, CGCSP Build Zip, Incrementing version and running build-zip.js..., 5, 1
    exitCode := RunPythonHelper(buildZipPy, output)
    if (exitCode != 0) {
        ShowError(output)
    } else {
        ShowToast("CGCSP Build Zip", output)
    }
    Gosub, UpdateState
return

PushLocalToGit:
    if (pushGitInProgress) {
        ToastMessage("Git push is already running.", 5000)
        return
    }

    FileDelete, %pushGitStatusPath%
    pushGitPid := 0
    pushGitLastStatus := "STEP|Starting local-to-git sync..."
    pushGitInProgress := 1
    Menu, Tray, Disable, Push local to git
    ToastMessage("Starting local-to-git sync...", 5000)
    Run, "%psExe%" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%pushGitPs%", %projectRoot%, Hide UseErrorLevel, pushGitPid
    if (ErrorLevel) {
        pushGitInProgress := 0
        Menu, Tray, Enable, Push local to git
        ToastMessage("Could not start Git push. Check PushLocalToGit.ps1.", 8000)
        return
    }

    SetTimer, WatchPushGitProgress, 1500
return

WatchPushGitProgress:
    if FileExist(pushGitStatusPath) {
        FileRead, statusText, %pushGitStatusPath%
        statusText := Trim(statusText, "`r`n ")
        if (statusText != "" && statusText != pushGitLastStatus) {
            pushGitLastStatus := statusText
            finalStatusKind := ShowProgressStatus(statusText)
        }
    }

    Process, Exist, %pushGitPid%
    if (ErrorLevel = pushGitPid)
        return

    SetTimer, WatchPushGitProgress, Off
    pushGitInProgress := 0
    if FileExist(pushGitPs)
        Menu, Tray, Enable, Push local to git

    finalStatusKind := GetProgressStatusKind(pushGitLastStatus)
    if !(finalStatusKind = "OK" || finalStatusKind = "ERROR")
        ToastMessage("Git push finished. Check _temp-files\tray-git-sync\git-sync.log.", 8000)
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
    global psExe, startPs, projectRoot
    Run, "%psExe%" -NoProfile -Sta -ExecutionPolicy Bypass -WindowStyle Hidden -File "%startPs%", %projectRoot%, Hide
}

StopValidatorProcesses() {
    global psExe, stopPs, projectRoot
    RunWait, "%psExe%" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%stopPs%", %projectRoot%, Hide
}

GetValidatorProcessCounts(ByRef launcherCount, ByRef runCount) {
    global projectRoot
    root := projectRoot
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
    global psExe, projectRoot
    tempFile := A_Temp "\cgcsp-devscrape-tray-" A_TickCount ".txt"
    output := ""
    RunWait, %ComSpec% /C ""%psExe%" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%scriptPath%" > "%tempFile%" 2>&1", %projectRoot%, Hide UseErrorLevel
    exitCode := ErrorLevel
    FileRead, output, %tempFile%
    FileDelete, %tempFile%
    return exitCode
}

RunVisiblePowerShellHelper(scriptPath) {
    global psExe, projectRoot
    Run, "%psExe%" -NoProfile -ExecutionPolicy Bypass -NoExit -File "%scriptPath%", %projectRoot%, UseErrorLevel
    if (ErrorLevel) {
        ToastMessage("Could not start the requested PowerShell helper.", 8000)
    }
}

RunPythonHelper(scriptPath, ByRef output) {
    global projectRoot
    tempFile := A_Temp "\cgcsp-devscrape-tray-python-" A_TickCount ".txt"
    output := ""
    RunWait, %ComSpec% /C py -3 "%scriptPath%" > "%tempFile%" 2>&1, %projectRoot%, Hide UseErrorLevel
    exitCode := ErrorLevel
    FileRead, output, %tempFile%
    FileDelete, %tempFile%
    return exitCode
}

ShowProgressStatus(statusText) {
    statusKind := GetProgressStatusKind(statusText)
    pipePos := InStr(statusText, "|")
    statusMessage := pipePos ? SubStr(statusText, pipePos + 1) : statusText
    if (statusMessage = "")
        return statusKind

    statusTimeout := (statusKind = "ERROR") ? 8000 : 5000
    ToastMessage(statusMessage, statusTimeout)
    return statusKind
}

GetProgressStatusKind(statusText) {
    pipePos := InStr(statusText, "|")
    if (!pipePos)
        return ""
    return SubStr(statusText, 1, pipePos - 1)
}

; Function to create a modern dark toast notification
ToastMessage(Text, Timeout := 3000) {
    static bg := "18181B"
    static fg := "F4F4F5"
    static radius := 12

    Gui, Toast:Destroy
    Gui, Toast:+AlwaysOnTop -Caption +E0x80000 +E0x20 +ToolWindow
    Gui, Toast:Color, 4A3B8C
    Gui, Toast:Font, s16 w700, Segoe UI
    Gui, Toast:Margin, 32, 16

    Gui, Toast:Add, Text, c%fg%, %Text%

    Gui, Toast:+LastFound
    hwnd := WinExist()

    ; Position bottom right
    SysGet, Mon, MonitorWorkArea, 1
    offscreenX := MonRight + 100
    offscreenY := MonBottom + 100

    Gui, Toast:Show, NoActivate AutoSize x%offscreenX% y%offscreenY%

    ; Get actual size after show
    WinGetPos,,, toastW, toastH, ahk_id %hwnd%
    xPos := MonRight - toastW - 24
    yPos := MonBottom - toastH - 24

    WinMove, ahk_id %hwnd%, , %xPos%, %yPos%

    ; Round corners
    hRgn := DllCall("CreateRoundRectRgn", "int", 0, "int", 0, "int", toastW, "int", toastH, "int", radius * 2, "int", radius * 2, "ptr")
    DllCall("SetWindowRgn", "ptr", hwnd, "ptr", hRgn, "int", true)

    ; Enable shadow
    DllCall("dwmapi\DwmSetWindowAttribute", "ptr", hwnd, "int", 2, "int*", 2, "int", 4)

    WinSet, Transparent, 252, ahk_id %hwnd%

    SetTimer, CloseToast, -%Timeout%
    Return

    CloseToast:
    Gui, Toast:Destroy
    Return
}

ParentDirectory(path) {
    SplitPath, path, , parentPath
    return parentPath
}

ShowError(output) {
    message := output
    if (message = "")
        message := "The requested helper failed."
    MsgBox, 16, DevScrape Validator Tray, %message%
}

ShowToast(title, output) {
    message := Trim(output, "`r`n`t ")
    if (message = "")
        message := "Command completed."
    TrayTip, %title%, %message%, 20, 1
}
