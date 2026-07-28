import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Account, Campaign, Lead, Draft, Followup, LeadEvent as Event, Config, ApiKey, ImportLog } from '../db/models.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backupDir = path.join(__dirname, '../../backups')

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true })
}

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })

// Root route - redirect to list
router.get('/', (req, res) => {
  res.redirect('/api/backups/list')
})

const MODELS = {
  Account, Campaign, Lead, Draft, Followup, Event, Config, ApiKey, ImportLog
}

router.get('/list', (req, res) => {
  try {
    if (!fs.existsSync(backupDir)) {
      return res.json([])
    }
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stats = fs.statSync(path.join(backupDir, f))
        return {
          name: f,
          size: stats.size,
          createdAt: stats.birthtime,
        }
      })
      .sort((a, b) => b.createdAt - a.createdAt)
    res.json(files)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/create', async (req, res) => {
  try {
    const backup = {}
    for (const [name, model] of Object.entries(MODELS)) {
      backup[name] = await model.find({}).lean()
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `mailflow-backup-${timestamp}.json`
    const filePath = path.join(backupDir, filename)

    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2))

    res.json({ success: true, message: 'Backup created', filename })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/restore/:name', async (req, res) => {
  try {
    const { name } = req.params
    const filePath = path.join(backupDir, name)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup file not found' })
    }

    const backup = JSON.parse(fs.readFileSync(filePath, 'utf8'))

    // Restore each collection
    for (const [name, model] of Object.entries(MODELS)) {
      if (backup[name]) {
        await model.deleteMany({})
        if (backup[name].length > 0) {
          await model.insertMany(backup[name])
        }
      }
    }

    res.json({ success: true, message: 'Restored from backup' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Download current database as backup file
router.get('/download', async (req, res) => {
  try {
    const backup = {}
    for (const [name, model] of Object.entries(MODELS)) {
      backup[name] = await model.find({}).lean()
    }
    
    const buffer = Buffer.from(JSON.stringify(backup, null, 2))
    
    const now = new Date()
    const timestamp = now.toISOString().split('T')[0]
    const filename = `mailflow-backup-${timestamp}.json`
    
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)
    
    console.log('✓ Database backup downloaded:', filename)
  } catch (error) {
    console.error('Download backup error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Upload and restore from backup file
router.post('/upload', upload.single('backup'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' })
    }
    
    if (!req.file.originalname.includes('.json')) {
      return res.status(400).json({ error: 'Invalid file. Must be a .json backup file' })
    }

    const backup = JSON.parse(req.file.buffer.toString('utf8'))

    // Validate backup format (check for at least some models)
    if (!backup.Campaign && !backup.Lead) {
      return res.status(400).json({ error: 'Invalid backup format' })
    }

    // Restore each collection
    for (const [name, model] of Object.entries(MODELS)) {
      if (backup[name]) {
        await model.deleteMany({})
        if (backup[name].length > 0) {
          await model.insertMany(backup[name])
        }
      }
    }
    
    console.log('✓ Database restored from uploaded backup:', req.file.originalname)
    res.json({ 
      success: true, 
      message: 'Backup uploaded and restored successfully!',
      requiresReload: true 
    })
  } catch (error) {
    console.error('Upload backup error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router