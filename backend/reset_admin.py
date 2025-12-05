import sqlite3
from app.core.auth.security import get_password_hash

conn = sqlite3.connect('finance_system.db')
new_hash = get_password_hash('admin123')
conn.execute("UPDATE sys_user SET password=? WHERE username='admin'", (new_hash,))
conn.commit()
print(f"Admin password reset successfully!")
conn.close()
