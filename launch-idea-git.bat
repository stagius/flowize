@echo off
set IDEA_HOME=Z:\idea-git
set IDEA_CONFIG=%USERPROFILE%\.idea-git-only

if "%~1"=="" (
    set REPO_PATH=%CD%
) else (
    set REPO_PATH=%~1
)

"%IDEA_HOME%\bin\idea64.exe" ^
  -Didea.config.path="%IDEA_CONFIG%\config" ^
  -Didea.system.path="%IDEA_CONFIG%\system" ^
  -Didea.plugins.path="%IDEA_CONFIG%\plugins" ^
  "%REPO_PATH%"