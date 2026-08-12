Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "E:\ai-chat-desktop"
WshShell.Run "cmd /c node scripts\dev-watch.js", 0, False
