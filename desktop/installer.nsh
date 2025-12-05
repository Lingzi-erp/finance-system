; 自定义 NSIS 脚本

; 安装前关闭正在运行的应用
!macro customInstall
  ; 尝试关闭正在运行的应用程序
  nsExec::ExecToLog 'taskkill /F /IM "财务管理系统.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "backend.exe" /T'
  
  ; 等待进程完全退出
  Sleep 2000
!macroend

; 卸载时的处理
!macro customUnInstall
  ; 关闭正在运行的应用程序
  nsExec::ExecToLog 'taskkill /F /IM "财务管理系统.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "backend.exe" /T'
  
  ; 等待进程完全退出
  Sleep 2000
  
  ; 只有在非静默模式（真正的卸载）时才询问是否删除用户数据
  ; 更新时是静默卸载，不会显示这个对话框
  IfSilent skipDataPrompt
    MessageBox MB_YESNO "是否同时删除用户数据（包括数据库）？$\n$\n选择'是'将删除所有数据，选择'否'将保留数据。" IDYES deleteData IDNO skipDataPrompt
  
  deleteData:
    RMDir /r "$APPDATA\finance-system"
    Goto done
    
  skipDataPrompt:
    ; 静默模式（更新）或用户选择不删除，保留数据
    
  done:
!macroend
