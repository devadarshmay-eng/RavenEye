import { useEffect, useState } from 'react'
import { Moon, Droplets, Save, Clipboard, Sun, Moon as MoonIcon, Github, ExternalLink } from 'lucide-react'
import { Button } from './components/ui/button'
import { Slider } from './components/ui/slider'
import { Switch } from './components/ui/switch'
import { Toaster } from './components/ui/toaster'
import { useToast } from './components/ui/use-toast'
import { Card } from './components/ui/card'

interface Settings {
    dimIntensity: number
    blurIntensity: number
    saveImage: boolean
    autoCopy: boolean
    showCaptureDetails: boolean
    accentColor: string
    theme: 'light' | 'dark'
}

const DEFAULT_SETTINGS: Settings = {
    dimIntensity: 50,
    blurIntensity: 0,
    saveImage: false,
    autoCopy: true,
    showCaptureDetails: false,
    accentColor: '#7C3AED',
    theme: 'dark'
}

function App() {
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
    const [loading, setLoading] = useState(true)
    const { toast } = useToast()

    // Load settings
    useEffect(() => {
        // @ts-ignore - Chrome API
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            // @ts-ignore
            chrome.storage.sync.get(DEFAULT_SETTINGS, (items: Settings) => {
                setSettings(items)
                setLoading(false)
                applyTheme(items.theme)
            })
        } else {
            setLoading(false) // Dev mode
        }
    }, [])

    const saveSettings = (newSettings: Settings) => {
        setSettings(newSettings)
        applyTheme(newSettings.theme)

        // @ts-ignore
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            // @ts-ignore
            chrome.storage.sync.set(newSettings, () => {
                // Optional: show toast only on specific actions if needed
            })
        }
    }

    const applyTheme = (theme: 'light' | 'dark') => {
        const root = window.document.documentElement
        root.classList.remove('light', 'dark')
        root.classList.add(theme)
    }

    const handleCapture = () => {
        // @ts-ignore
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            // @ts-ignore
            chrome.runtime.sendMessage({ action: 'ACTIVATE_FROM_POPUP' }, () => {
                window.close()
            })
        } else {
            toast({ title: "Capture Activated", description: "This would trigger capture in extension." })
        }
    }

    if (loading) return <div className="w-[340px] h-full bg-background flex items-center justify-center">Loading...</div>

    return (
        <div className="w-[340px] min-h-[500px] bg-background text-foreground flex flex-col font-sans select-none">

            {/* Header */}
            <div className="px-5 py-4 border-b flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden shadow-lg shadow-primary/20`}>
                        <img src="/icons/icon128.png" alt="Logo" className="w-full h-full object-cover" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold leading-none">RavenEye</h1>
                        <span className="text-[10px] text-muted-foreground font-medium">Text Extractor</span>
                    </div>
                </div>
                <div className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border font-mono">
                    v1.1
                </div>
            </div>

            <div className="p-5 space-y-6 flex-1 overflow-y-auto">

                {/* Hero Action */}
                <div className="text-center space-y-3">
                    <Button
                        onClick={handleCapture}
                        className="w-full h-12 text-base shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all font-semibold"
                    >
                        Activate Capture
                    </Button>
                    <p className="text-[10px] text-muted-foreground">
                        or press <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-foreground">Ctrl+Shift+E</kbd>
                    </p>
                </div>

                {/* Visual Settings */}
                <div className="space-y-4">
                    <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold pl-1">Visual Settings</h3>

                    <Card className="p-4 space-y-5 border-none bg-secondary/20 shadow-none">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Moon className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">Dim Level</span>
                                </div>
                                <span className="text-xs font-mono text-muted-foreground">{settings.dimIntensity}%</span>
                            </div>
                            <Slider
                                defaultValue={[settings.dimIntensity]}
                                max={90}
                                step={1}
                                onValueChange={(val) => saveSettings({ ...settings, dimIntensity: val[0] })}
                            />
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Droplets className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">Blur</span>
                                </div>
                                <span className="text-xs font-mono text-muted-foreground">{settings.blurIntensity}px</span>
                            </div>
                            <Slider
                                defaultValue={[settings.blurIntensity]}
                                max={20}
                                step={1}
                                onValueChange={(val) => saveSettings({ ...settings, blurIntensity: val[0] })}
                            />
                        </div>
                    </Card>
                </div>

                {/* Preferences */}
                <div className="space-y-4">
                    <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold pl-1">Preferences</h3>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-1">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-secondary text-muted-foreground">
                                    <Save className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium">Auto Save</span>
                                    <span className="text-[10px] text-muted-foreground">Download capture</span>
                                </div>
                            </div>
                            <Switch
                                checked={settings.saveImage}
                                onCheckedChange={(checked) => saveSettings({ ...settings, saveImage: checked })}
                            />
                        </div>

                        <div className="flex items-center justify-between p-1">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-secondary text-muted-foreground">
                                    <Clipboard className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium">Auto Copy</span>
                                    <span className="text-[10px] text-muted-foreground">Copy to clipboard</span>
                                </div>
                            </div>
                            <Switch
                                checked={settings.autoCopy}
                                onCheckedChange={(checked) => saveSettings({ ...settings, autoCopy: checked })}
                            />
                        </div>

                        <div className="flex items-center justify-between p-1">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-secondary text-muted-foreground">
                                    {settings.theme === 'dark' ? <MoonIcon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium">Theme</span>
                                    <span className="text-[10px] text-muted-foreground">{settings.theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                                </div>
                            </div>
                            <Switch
                                checked={settings.theme === 'dark'}
                                onCheckedChange={(checked) => saveSettings({ ...settings, theme: checked ? 'dark' : 'light' })}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-card/50 flex items-center justify-between text-xs text-muted-foreground">
                <a href="#" className="hover:text-foreground transition-colors">Help & Support</a>
                <a href="https://github.com/devadarshmay-eng/RavenEye" target="_blank" className="flex items-center gap-1 hover:text-foreground transition-colors">
                    <Github className="w-3 h-3" /> GitHub <ExternalLink className="w-3 h-3" />
                </a>
            </div>

            <Toaster />
        </div >
    )
}

export default App
