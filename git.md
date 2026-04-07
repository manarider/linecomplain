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

## ดู status / log
```bash
git status
git log --oneline -10
```
