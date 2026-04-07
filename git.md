# Git Configuration

## Repository
- URL: https://github.com/manarider/linecomplain.git

## Setup (ครั้งแรก)
```bash
git init
git config user.name "manarider"
git config user.email "your@email.com"
git remote add origin https://github.com/manarider/linecomplain.git
git branch -M main
```

## Push ครั้งแรก
```bash
git add .
git commit -m "initial commit"
git push -u origin main
```

## Workflow ปกติ
```bash
git add .
git commit -m "รายละเอียดที่แก้ไข"
git push
```

## Deploy (build frontend + restart backend + push git)
```bash
cd /home/complain/app/frontend && npm run build && pm2 restart complain-backend && cd /home/complain/app && git add . && git commit -m "update" && git push
```

## ดู status / log
```bash
git status
git log --oneline -10
```

## PM2 Commands
```bash
pm2 status                                    # ดูสถานะ
pm2 restart complain-backend                  # restart
pm2 logs complain-backend --lines 30          # ดู log ล่าสุด
pm2 logs complain-backend --nostream          # ดู log แบบไม่ follow
```
