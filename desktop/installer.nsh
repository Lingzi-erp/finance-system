; 自定义 NSIS 脚本

; 安装前关闭正在运行的应用
!macro customInstall
  ; 尝试关闭正在运行的应用程序
  nsExec::ExecToLog 'taskkill /F /IM "财务管理系统.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "backend.exe" /T'
  
  ; 等待进程完全退出
  Sleep 2000
!macroend

; 卸载前关闭应用并清理
!macro customUnInstall
  ; 关闭正在运行的应用程序
  nsExec::ExecToLog 'taskkill /F /IM "财务管理系统.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "backend.exe" /T'
  
  ; 等待进程完全退出
  Sleep 2000
  
  ; 删除用户数据目录（如果用户确认）
  MessageBox MB_YESNO "是否同时删除用户数据（包括数据库）？$\n$\n选择'是'将删除所有数据，选择'否'将保留数据。" IDYES deleteData IDNO skipDelete
  
  deleteData:
    RMDir /r "$APPDATA\${APP_FILENAME}"
    Goto done
    
  skipDelete:
    ; 不删除用户数据
    
  done:
!macroend
