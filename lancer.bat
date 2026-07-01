@echo off
title Rapport Journalier Chantier
cd /d "%~dp0"
echo.
echo ============================================
echo   Rapport Journalier de Chantier
echo ============================================
echo.
echo Demarrage du serveur local sur http://localhost:8765
echo.
echo -^> L'app va s'ouvrir dans ton navigateur.
echo -^> Ferme cette fenetre pour arreter le serveur.
echo.
start "" http://localhost:8765
python -m http.server 8765
pause
