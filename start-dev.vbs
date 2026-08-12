Set ws = CreateObject("WScript.Shell")
ws.CurrentDirectory = "E:\ai-chat-desktop"
ws.Run """C:\Program Files\nodejs\npm.cmd"" run dev", 0, False
