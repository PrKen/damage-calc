import subprocess

result = subprocess.run(["node", "test_calc.js"], capture_output=True, text=True)
print(result.stdout)  # Affiche les résultats
