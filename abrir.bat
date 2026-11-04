@echo off
cd /d "%~dp0"
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:8766/"
python -m http.server 8766
