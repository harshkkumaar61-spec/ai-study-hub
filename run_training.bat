@echo off
echo --- STARTING AI TRAINING ---
echo (Yeh file 'Data_for_AI' ko padhegi aur 'storage' folder banayegi)
echo.
echo !!! IMPORTANT !!!
echo (Ismein time lagega - 1700 page ke liye 2-3 ghante bhi lag sakte hain)
echo (Training shuru karne se pehle 'Ollama' app ko chalu (running) rakhna)
echo.

:: Yeh line automatically 'Backend' folder mein chali jaati hai
cd /d "%~dp0"

echo Now in folder: %cd%
echo Starting Python training script (train.py)...
echo.

python train.py

echo.
echo --- TRAINING COMPLETE! ---
echo ('storage' folder ban gaya hai. Ab aap 'run_server.bat' chala sakte hain.)
echo.
pause
