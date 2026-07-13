import React, { useState, useMemo } from "react";
import {
  X,
  Key,
  Cpu,
  Search,
  RefreshCw,
  Check,
  AlertTriangle,
  Eye,
  EyeOff,
  Sliders,
  User,
  Plus,
  Trash2,
  Edit2,
  Users,
  Sparkles,
} from "lucide-react";
import { AIPersona, AITargetAudience, AiEndpoint, PRESET_ENDPOINTS } from "../types";
import { PRESET_PERSONAS } from "../lib/personas";
import { PRESET_AUDIENCES } from "../lib/audiences";

interface Model {
  name: string;
  displayName: string;
  description: string;
}

interface SettingsModalProps {
  customEndpoints: AiEndpoint[];
  onUpdateCustomEndpoints: (endpoints: AiEndpoint[]) => void;
  selectedEndpointId: string;
  onSelectEndpointId: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  availableModels: Model[];
  loading: boolean;
  error: string | null;
  bypassCache: boolean;
  onToggleBypassCache: (val: boolean) => void;
  onRefreshModels: (key?: string) => void;
  lang: string;
  // Persona Props
  selectedPersonaId: string;
  onSelectPersonaId: (id: string) => void;
  customPersonas: AIPersona[];
  onUpdateCustomPersonas: (personas: AIPersona[]) => void;
  // Target Audience Props
  selectedAudienceId: string;
  onSelectAudienceId: (id: string) => void;
  customAudiences: AITargetAudience[];
  onUpdateCustomAudiences: (audiences: AITargetAudience[]) => void;
  // Search Sources
  searchSources: string[];
  onSearchSourcesChange: (sources: string[]) => void;
  trendingTimeframe: "day" | "week" | "month";
  onTrendingTimeframeChange: (timeframe: "day" | "week" | "month") => void;
}

const TRANSLATIONS: Record<string, Record<string, string>> = {
  ja: {
    title: "AIエンジン設定",
    subtitle: "Gemini APIとモデルの設定",
    apiKeyHeader: "Gemini API キー",
    apiKeyDesc: "他のモデルを使用するには、カスタムGemini APIキーを入力してください。空欄の場合、サーバーはデフォルトのホストされたAPIキーを使用します。",
    apiKeyPlaceholder: "Gemini API キーを貼り付け...",
    apply: "適用",
    keyActive: "カスタムAPIキーが正常に設定され、有効になりました。",
    selectModelHeader: "Gemini モデルの選択",
    refetchList: "リスト再取得",
    searchPlaceholder: "モデルを検索...",
    clear: "クリア",
    fetchingModels: "互換性のあるGeminiモデルを取得中...",
    noModels: "一致するGeminiモデルが見つかりません。",
    errorHeader: "モデル一覧の取得エラー",
    activeLabel: "有効なモデル: ",
    resetToDefault: "デフォルトにリセット",
    done: "完了",
    defaultTag: "デフォルト",
    fallbackDesc: "Gemini APIから動的に取得されました",
    personaTitle: "AIライターペルソナ設定",
    personaDesc: "リポジトリ解説(Deep Dive)を生成する際、AIに特定の役割や書き方のスタイルを指示できます。",
    addPersona: "ペルソナを追加",
    editPersona: "編集",
    deletePersona: "削除",
    save: "保存",
    cancel: "キャンセル",
    personaNameLabel: "ペルソナ名 (例: インフルエンサー風)",
    personaPromptLabel: "プロンプト指示 (AIへの指示内容)",
    presetBadge: "プリセット",
    customBadge: "カスタム",
    placeholderName: "例：2chひろゆき風、バイラル記者など...",
    placeholderPrompt: "どのような言葉遣いで、どのような視点で解説するかを詳細に記述してください。例：『〜ですよ。』のような話し言葉で、初心者向けに...",
    noCustom: "カスタムペルソナはありません。新しいペルソナを作成して、解説をあなたの好みの文体にカスタマイズしましょう！",
    editPersonaHeader: "ペルソナを編集",
    addPersonaHeader: "新しいペルソナを追加",
    selectPersonaHeader: "ペルソナを選択",
    audienceTitle: "ターゲット読者設定",
    audienceDesc: "レポートがターゲットとする読者層を設定します。AIは指定された読者層の技術レベルや関心に合わせて、解説の深さや言葉遣いを自動で最適化します。",
    addAudience: "読者タイプを追加",
    editAudience: "読者タイプを編集",
    deleteAudience: "削除",
    audienceNameLabel: "読者タイプ名 (例: 非エンジニアPM)",
    audiencePromptLabel: "ターゲット指示 (AIへの読者層の指示内容)",
    placeholderAudienceName: "例：インフラ初学者、研究者、経営層など...",
    placeholderAudiencePrompt: "読者層の特徴や求めている情報を記述してください。例：『Dockerの概念すら知らない人向けに、徹底的に比喩を使って簡単に説明してください。』",
    noCustomAudience: "カスタムターゲット読者はありません。新しい読者層タイプを作成して、レポートを任意のレベルに最適化しましょう！",
    editAudienceHeader: "ターゲット読者を編集",
    addAudienceHeader: "新しいターゲット読者を追加",
    selectAudienceHeader: "ターゲット読者を選択",
    generateWithAI: "AIでプロンプトを自動生成",
    aiGenerating: "AI生成中...",
    aiGenerateHint: "名前/キーワードを入力してボタンを押すと、AIが魅力的な詳細プロンプトを自動構成します",
    enterNameFirstError: "まず、名前やキーワードを入力してください（例：辛口エンジニア）",
    bypassCacheLabel: "AIキャッシュをバイパス (常に新規生成)",
    bypassCacheDesc: "チェックを入れると、以前に要約したことがあるデータもキャッシュを使わず、毎回新しくAIに生成させます。(クォータ消費にご注意ください)"
  },
  en: {
    title: "AI Engine Settings",
    subtitle: "Configure Gemini API and Models",
    apiKeyHeader: "Gemini API Key",
    apiKeyDesc: "Input your custom Gemini API key to use other models. If left blank, the server will fall back to the default hosted API key.",
    bypassCacheLabel: "Bypass AI Cache (Always Regenerate)",
    bypassCacheDesc: "When checked, the app will bypass all caches and force a fresh AI analysis on every request. (Watch your API quota limit)",
    apiKeyPlaceholder: "Paste your Gemini API Key...",
    apply: "Apply",
    keyActive: "Custom API Key successfully configured and active.",
    selectModelHeader: "Select Gemini Model",
    refetchList: "Refetch List",
    searchPlaceholder: "Search models...",
    clear: "Clear",
    fetchingModels: "Fetching compatible Gemini models...",
    noModels: "No matching Gemini models found.",
    errorHeader: "Error Listing Models",
    activeLabel: "Active: ",
    resetToDefault: "Reset to default",
    done: "Done",
    defaultTag: "default",
    fallbackDesc: "Retrieved dynamically from Gemini API",
    personaTitle: "AI Writer Persona",
    personaDesc: "Guide the tone, style, and persona of the AI when generating repository Deep Dives.",
    addPersona: "Add Persona",
    editPersona: "Edit",
    deletePersona: "Delete",
    save: "Save",
    cancel: "Cancel",
    personaNameLabel: "Persona Name (e.g. Tech Blogger)",
    personaPromptLabel: "Prompt Instructions (AI directives)",
    presetBadge: "preset",
    customBadge: "custom",
    placeholderName: "e.g. Snarky Reviewer, Viral Journalist...",
    placeholderPrompt: "Detail how the AI should write. e.g. Write in a casual slang tone with highly engaging titles...",
    noCustom: "No custom personas yet. Create a new one to customize the review style!",
    editPersonaHeader: "Edit Persona",
    addPersonaHeader: "Add New Persona",
    selectPersonaHeader: "Select Persona",
    audienceTitle: "Target Audience Settings",
    audienceDesc: "Configure the target reader layer. The AI will automatically optimize the depth, vocabulary, and technical level of the report to match this audience's expectations.",
    addAudience: "Add Audience Type",
    editAudience: "Edit Audience Type",
    deleteAudience: "Delete",
    audienceNameLabel: "Audience Type Name (e.g. Non-technical Manager)",
    audiencePromptLabel: "Audience Instructions (AI target directives)",
    placeholderAudienceName: "e.g. Junior Dev, Infrastructure Learner, Researcher...",
    placeholderAudiencePrompt: "Describe who the reader is and what they expect. e.g. Explaining to someone who doesn't know Docker at all, using rich analogies...",
    noCustomAudience: "No custom target audiences yet. Create one to optimize reports for any specific level!",
    editAudienceHeader: "Edit Target Audience",
    addAudienceHeader: "Add New Target Audience",
    selectAudienceHeader: "Select Target Audience",
    generateWithAI: "Generate with AI",
    aiGenerating: "AI Generating...",
    aiGenerateHint: "Enter simple keywords or a name above, then click to automatically generate a detailed prompt.",
    enterNameFirstError: "Please enter a name or keywords first (e.g. Snarky Developer)."
  },
  zh: {
    title: "AI 引擎设置",
    subtitle: "配置 Gemini API 和模型",
    apiKeyHeader: "Gemini API 密钥",
    apiKeyDesc: "输入您的自定义 Gemini API 密钥以使用其他模型。如果留空，服务器将退回到默认托管的 API 密钥。",
    apiKeyPlaceholder: "粘贴您的 Gemini API 密钥...",
    apply: "应用",
    keyActive: "自定义 API 密钥已成功配置并生效。",
    selectModelHeader: "选择 Gemini 模型",
    refetchList: "重新获取列表",
    searchPlaceholder: "搜索模型...",
    clear: "清除",
    fetchingModels: "正在获取兼容的 Gemini 模型...",
    noModels: "未找到匹配的 Gemini 模型。",
    errorHeader: "列出模型时出错",
    activeLabel: "当前活动: ",
    resetToDefault: "重置为默认值",
    done: "完成",
    defaultTag: "默认",
    fallbackDesc: "从 Gemini API 动态检索",
    personaTitle: "AI 写作人设設定",
    personaDesc: "在生成仓库深度分析报告时，引导 AI 的语气、风格和角色设定。",
    addPersona: "添加人设",
    editPersona: "编辑",
    deletePersona: "删除",
    save: "保存",
    cancel: "取消",
    personaNameLabel: "人设名称 (例如: 技术博主)",
    personaPromptLabel: "提示词指令 (给 AI 的指令)",
    presetBadge: "预设",
    customBadge: "自定义",
    placeholderName: "例如：毒舌评审员、病毒式记者...",
    placeholderPrompt: "详细说明 AI 应该如何撰写。例如：使用通俗易懂的口语，注重实用的初学者指南...",
    noCustom: "尚无自定义人设。创建一个新的人设来定制您的评测风格！",
    editPersonaHeader: "编辑人设",
    addPersonaHeader: "添加新人设",
    selectPersonaHeader: "选择人设",
    audienceTitle: "目标读者设置",
    audienceDesc: "设置报告针对的目标读者群。AI会根据读者的技术水平或关注点，自动优化讲解的深度、专业词汇和通俗度。",
    addAudience: "添加读者类型",
    editAudience: "编辑读者类型",
    deleteAudience: "删除",
    audienceNameLabel: "读者类型名称 (例如: 非技术PM)",
    audiencePromptLabel: "目标指令 (给 AI 的读者群指令)",
    placeholderAudienceName: "例如：云原生初学者、研究员、管理层...",
    placeholderAudiencePrompt: "描述读者群的特征和他们想要的信息。例如：『针对完全不懂Docker的初学者，请尽量使用通俗比喻解释...』",
    noCustomAudience: "尚无自定义目标读者。创建一个新的读者群类型，使报告最契合您的受众水平！",
    editAudienceHeader: "编辑目标读者",
    addAudienceHeader: "添加新目标读者",
    selectAudienceHeader: "选择目标读者",
    generateWithAI: "使用 AI 自动生成",
    aiGenerating: "AI 生成中...",
    aiGenerateHint: "在上方输入简单的关键词或名称，然后点击此按钮让 AI 自动生成详细的提示词。",
    enterNameFirstError: "请先输入名称或关键词（例如：毒舌程序员）。"
  },
  es: {
    title: "Ajustes del Motor de IA",
    subtitle: "Configurar Gemini API y Modelos",
    apiKeyHeader: "Clave API de Gemini",
    apiKeyDesc: "Ingrese su clave API personalizada de Gemini para usar otros modelos. Si se deja en blanco, el servidor volverá a la clave API alojada predeterminada.",
    apiKeyPlaceholder: "Pegar su clave API de Gemini...",
    apply: "Aplicar",
    keyActive: "Clave API personalizada configurada y activa correctamente.",
    selectModelHeader: "Seleccionar Modelo de Gemini",
    refetchList: "Actualizar Lista",
    searchPlaceholder: "Buscar modelos...",
    clear: "Limpiar",
    fetchingModels: "Obteniendo modelos compatibles de Gemini...",
    noModels: "No se encontraron modelos compatibles de Gemini.",
    errorHeader: "Error al Listar Modelos",
    activeLabel: "Activo: ",
    resetToDefault: "Restablecer al valor predeterminado",
    done: "Hecho",
    defaultTag: "predeterminado",
    fallbackDesc: "Recuperado dinámicamente de la API de Gemini",
    personaTitle: "Personalidad del Escritor de IA",
    personaDesc: "Guíe el tono, estilo y personalidad de la IA al generar análisis profundos de los repositorios.",
    addPersona: "Agregar Personalidad",
    editPersona: "Editar",
    deletePersona: "Eliminar",
    save: "Guardar",
    cancel: "Cancelar",
    personaNameLabel: "Nombre de la Personalidad (ej. Blogger de Tecnología)",
    personaPromptLabel: "Instrucciones del Prompt (directivas de IA)",
    presetBadge: "predeterminado",
    customBadge: "personalizado",
    placeholderName: "ej. Crítico Sarcástico, Periodista Viral...",
    placeholderPrompt: "Detalle cómo debe escribir la IA. ej. Escriba en un tono casual con títulos muy atractivos...",
    noCustom: "Aún no hay personalidades personalizadas. ¡Crea una nueva para personalizar tu estilo de revisión!",
    editPersonaHeader: "Editar Personalidad",
    addPersonaHeader: "Agregar Nueva Personalidad",
    selectPersonaHeader: "Seleccionar Personalidad",
    audienceTitle: "Configuración de Audiencia",
    audienceDesc: "Configure el público objetivo para el informe. La IA optimizará automáticamente la profundidad, el vocabulario y el nivel técnico según sus expectativas.",
    addAudience: "Agregar Tipo de Audiencia",
    editAudience: "Editar Tipo de Audiencia",
    deleteAudience: "Eliminar",
    audienceNameLabel: "Nombre de la Audiencia (ej. PM No Técnico)",
    audiencePromptLabel: "Instrucciones de Audiencia (directivas de la IA)",
    placeholderAudienceName: "ej. Desarrollador Junior, Estudiante, Gerente...",
    placeholderAudiencePrompt: "Describa quién es el lector y qué espera. ej. Explicar para alguien que no conoce Docker en absoluto, usando analogías...",
    noCustomAudience: "No hay audiencias personalizadas aún. ¡Crea una para adaptar los informes a cualquier nivel!",
    editAudienceHeader: "Editar Audiencia",
    addAudienceHeader: "Agregar Nueva Audiencia",
    selectAudienceHeader: "Seleccionar Audiencia",
    generateWithAI: "Generar con IA",
    aiGenerating: "Generando con IA...",
    aiGenerateHint: "Ingrese palabras clave o un nombre arriba, luego haga clic para generar un prompt detallado automáticamente.",
    enterNameFirstError: "Por favor, ingrese un nombre o palabras clave primero (ej. Desarrollador sarcástico)."
  },
  de: {
    title: "KI-Engine-Einstellungen",
    subtitle: "Gemini-API und -Modelle konfigurieren",
    apiKeyHeader: "Gemini-API-Schlüssel",
    apiKeyDesc: "Geben Sie Ihren benutzerdefinierten Gemini-API-Schlüssel ein, um andere Modelle zu verwenden. Wenn das Feld leer bleibt, greift der Server auf den gehosteten API-Schlüssel zurück.",
    apiKeyPlaceholder: "Gemini-API-Schlüssel hier einfügen...",
    apply: "Anwenden",
    keyActive: "API-Schlüssel konfiguriert und aktiv.",
    selectModelHeader: "Gemini-Modell auswählen",
    refetchList: "Liste neu laden",
    searchPlaceholder: "Modelle suchen...",
    clear: "Löschen",
    fetchingModels: "Kompatible Gemini-Modelle werden geladen...",
    noModels: "Keine übereinstimmenden Gemini-Modelle gefunden.",
    errorHeader: "Fehler beim Auflisten der Modelle",
    activeLabel: "Aktiv: ",
    resetToDefault: "Auf Standard zurücksetzen",
    done: "Fertig",
    defaultTag: "Standard",
    fallbackDesc: "Dynamisch aus der Gemini-API abgerufen",
    personaTitle: "KI-Schreiber-Persona",
    personaDesc: "Steuern Sie Ton, Stil und Persona der KI beim Generieren von Repository-Detailanalysen.",
    addPersona: "Persona hinzufügen",
    editPersona: "Bearbeiten",
    deletePersona: "Löschen",
    save: "Speichern",
    cancel: "Abbrechen",
    personaNameLabel: "Name der Persona (z. B. Tech-Blogger)",
    personaPromptLabel: "Prompt-Anweisungen (KI-Richtlinien)",
    presetBadge: "Voreinstellung",
    customBadge: "Benutzerdefiniert",
    placeholderName: "z. B. Sarkastischer Kritiker, Viral-Journalist...",
    placeholderPrompt: "Beschreiben Sie, wie die KI schreiben soll. z. B. Schreiben Sie in einem lockeren Umgangston mit ansprechenden Überschriften...",
    noCustom: "Noch keine benutzerdefinierten Personas. Erstellen Sie eine neue, um den Review-Stil anzupassen!",
    editPersonaHeader: "Persona bearbeiten",
    addPersonaHeader: "Neue Persona hinzufügen",
    selectPersonaHeader: "Persona auswählen",
    audienceTitle: "Zielgruppen-Einstellungen",
    audienceDesc: "Konfigurieren Sie die Zielgruppe des Berichts. Die KI passt Detailtiefe, Vokabular und technisches Niveau automatisch an die Erwartungen an.",
    addAudience: "Zielgruppentyp hinzufügen",
    editAudience: "Zielgruppentyp bearbeiten",
    deleteAudience: "Löschen",
    audienceNameLabel: "Name der Zielgruppe (z. B. Nicht-technischer PM)",
    audiencePromptLabel: "Zielgruppen-Anweisungen (KI-Richtlinien)",
    placeholderAudienceName: "z. B. Junior-Entwickler, Student, Manager...",
    placeholderAudiencePrompt: "Beschreiben Sie, wer der Leser ist und was er erwartet. z. B. Erklären Sie es für jemanden, der Docker überhaupt nicht kennt, mit anschaulichen Analogien...",
    noCustomAudience: "Noch keine benutzerdefinierten Zielgruppen. Erstellen Sie eine eine, um Berichte an jedes Niveau anzupassen!",
    editAudienceHeader: "Zielgruppe bearbeiten",
    addAudienceHeader: "Neue Zielgruppe hinzufügen",
    selectAudienceHeader: "Zielgruppe auswählen",
    generateWithAI: "Mit KI generieren",
    aiGenerating: "KI generiert...",
    aiGenerateHint: "Geben Sie oben einfache Schlüsselwörter oder einen Namen ein und klicken Sie, um automatisch einen detaillierten Prompt zu erstellen.",
    enterNameFirstError: "Bitte geben Sie zuerst einen Namen oder Schlüsselwörter ein (z. B. Sarkastischer Entwickler)."
  },
  fr: {
    title: "Paramètres du moteur d'IA",
    subtitle: "Configurer l'API et les modèles Gemini",
    apiKeyHeader: "Clé API Gemini",
    apiKeyDesc: "Saisissez votre clé API Gemini personnalisée pour utiliser d'autres modèles. Si elle est laissée vide, le serveur utilisera la clé API hébergée par défaut.",
    apiKeyPlaceholder: "Collez votre clé API Gemini...",
    apply: "Appliquer",
    keyActive: "Clé API personnalisée configurée avec succès et active.",
    selectModelHeader: "Sélectionner le modèle Gemini",
    refetchList: "Actualiser la liste",
    searchPlaceholder: "Rechercher des modèles...",
    clear: "Effacer",
    fetchingModels: "Récupération des modèles Gemini compatibles...",
    noModels: "Aucun modèle Gemini correspondant trouvé.",
    errorHeader: "Erreur lors de la liste des modèles",
    activeLabel: "Actif : ",
    resetToDefault: "Réinitialiser",
    done: "Terminé",
    defaultTag: "par défaut",
    fallbackDesc: "Récupéré dynamiquement depuis l'API Gemini",
    personaTitle: "Persona du rédacteur IA",
    personaDesc: "Guidez le ton, le style et la personnalité de l'IA lors de la génération d'analyses approfondies.",
    addPersona: "Ajouter un Persona",
    editPersona: "Modifier",
    deletePersona: "Supprimer",
    save: "Enregistrer",
    cancel: "Annuler",
    personaNameLabel: "Nom du Persona (ex. Blogueur Tech)",
    personaPromptLabel: "Instructions de Prompt (directives pour l'IA)",
    presetBadge: "prédéfini",
    customBadge: "personnalisé",
    placeholderName: "ex. Critique Sardonique, Journaliste Viral...",
    placeholderPrompt: "Précisez comment l'IA doit rédiger. ex. Écrire sur un ton décontracté avec des titres engageants...",
    noCustom: "Aucun persona personnalisé pour le moment. Créez-en un pour personnaliser votre style d'analyse !",
    editPersonaHeader: "Modifier le Persona",
    addPersonaHeader: "Ajouter un nouveau Persona",
    selectPersonaHeader: "Sélectionner un Persona",
    audienceTitle: "Paramètres de l'Audience",
    audienceDesc: "Configurez le public cible pour le rapport. L'AI adaptera automatiquement la profondeur, le vocabulaire et le niveau technique selon ses attentes.",
    addAudience: "Ajouter un type d'audience",
    editAudience: "Modifier le type d'audience",
    deleteAudience: "Supprimer",
    audienceNameLabel: "Nom de l'Audience (ex. PM Non-Technique)",
    audiencePromptLabel: "Instructions d'Audience (directives pour l'IA)",
    placeholderAudienceName: "ex. Développeur Junior, Étudiant, Manager...",
    placeholderAudiencePrompt: "Décrivez qui est le lecteur et ce qu'il attend. ex. Expliquer à quelqu'un qui ne connaît pas du tout Docker, en utilisant des analogies...",
    noCustomAudience: "Aucune audience personnalisée pour le moment. Créez-en une pour adapter les rapports à n'importe quel niveau !",
    editAudienceHeader: "Modifier l'Audience",
    addAudienceHeader: "Ajouter une nouvelle Audience",
    selectAudienceHeader: "Sélectionner une Audience",
    generateWithAI: "Générer avec l'IA",
    aiGenerating: "Génération par l'IA...",
    aiGenerateHint: "Saisissez des mots-clés ou un nom ci-dessus, puis cliquez pour générer automatiquement un prompt détaillé.",
    enterNameFirstError: "Veuillez d'abord saisir un nom ou des mots-clés (ex. Développeur sardonique)."
  }
};

const LOCALIZED_MODEL_INFO: Record<string, Record<string, { displayName: string; description: string }>> = {
  ja: {
    "models/gemini-flash-lite-latest": {
      displayName: "Gemini Flash-Lite Latest",
      description: "低遅延タスク向けの高速で軽量なモデル (デフォルト)"
    },
    "models/gemini-3.5-flash": {
      displayName: "Gemini 3.5 Flash",
      description: "テキスト、コード、一般的な推論向けの標準的なモデル"
    },
    "models/gemini-3.1-flash-lite": {
      displayName: "Gemini 3.1 Flash-Lite",
      description: "低遅延タスク向けの非常に高速で効率的なモデル"
    },
    "models/gemini-3.1-pro-preview": {
      displayName: "Gemini 3.1 Pro Preview",
      description: "複雑な推論、数学、高度なコード分析のための最先端プロモデル"
    },
    "models/gemini-3.1-flash-lite-image": {
      displayName: "Gemini 3.1 Flash-Lite Image",
      description: "標準的な画像生成および認識処理モデル"
    },
    "models/gemini-3.1-flash-image": {
      displayName: "Gemini 3.1 Flash Image",
      description: "高品質な画像生成および認識モデル"
    }
  },
  zh: {
    "models/gemini-flash-lite-latest": {
      displayName: "Gemini Flash-Lite Latest",
      description: "用于低延迟任务的极速轻量模型 (默认)"
    },
    "models/gemini-3.5-flash": {
      displayName: "Gemini 3.5 Flash",
      description: "用于文本、代码和基本推理的标准模型"
    },
    "models/gemini-3.1-flash-lite": {
      displayName: "Gemini 3.1 Flash-Lite",
      description: "用于低延迟任务的极速高效模型"
    },
    "models/gemini-3.1-pro-preview": {
      displayName: "Gemini 3.1 Pro Preview",
      description: "用于复杂推理、数学和深度代码分析的高级专业模型"
    },
    "models/gemini-3.1-flash-lite-image": {
      displayName: "Gemini 3.1 Flash-Lite Image",
      description: "标准图像生成和处理模型"
    },
    "models/gemini-3.1-flash-image": {
      displayName: "Gemini 3.1 Flash Image",
      description: "高质量图像生成模型"
    }
  },
  es: {
    "models/gemini-flash-lite-latest": {
      displayName: "Gemini Flash-Lite Latest",
      description: "Modelo rápido y liviano para tareas de baja latencia (Predeterminado)"
    },
    "models/gemini-3.5-flash": {
      displayName: "Gemini 3.5 Flash",
      description: "Modelo estándar para texto, código y razonamiento básico"
    },
    "models/gemini-3.1-flash-lite": {
      displayName: "Gemini 3.1 Flash-Lite",
      description: "Modelo muy rápido y eficiente para tareas de baja latencia"
    },
    "models/gemini-3.1-pro-preview": {
      displayName: "Gemini 3.1 Pro Preview",
      description: "Modelo profesional avanzado para razonamiento complejo, matemáticas y análisis de código profundo"
    },
    "models/gemini-3.1-flash-lite-image": {
      displayName: "Gemini 3.1 Flash-Lite Image",
      description: "Modelo estándar de generación y procesamiento de imágenes"
    },
    "models/gemini-3.1-flash-image": {
      displayName: "Gemini 3.1 Flash Image",
      description: "Modelo de generación de imágenes de alta calidad"
    }
  },
  de: {
    "models/gemini-flash-lite-latest": {
      displayName: "Gemini Flash-Lite Latest",
      description: "Schnelles und leichtes Modell für Aufgaben mit geringer Latenz (Standard)"
    },
    "models/gemini-3.5-flash": {
      displayName: "Gemini 3.5 Flash",
      description: "Standardmodell für Text, Code und grundlegendes Denken"
    },
    "models/gemini-3.1-flash-lite": {
      displayName: "Gemini 3.1 Flash-Lite",
      description: "Sehr schnelles und effizientes Modell für Aufgaben mit geringer Latenz"
    },
    "models/gemini-3.1-pro-preview": {
      displayName: "Gemini 3.1 Pro Preview",
      description: "Fortgeschrittenes Pro-Modell für komplexes Denken, Mathematik und tiefe Codeanalyse"
    },
    "models/gemini-3.1-flash-lite-image": {
      displayName: "Gemini 3.1 Flash-Lite Image",
      description: "Standardmodell zur Bildgenerierung und -verarbeitung"
    },
    "models/gemini-3.1-flash-image": {
      displayName: "Gemini 3.1 Flash Image",
      description: "Hochwertiges Bildgenerierungsmodell"
    }
  },
  fr: {
    "models/gemini-flash-lite-latest": {
      displayName: "Gemini Flash-Lite Latest",
      description: "Modèle rapide et léger pour les tâches à faible latence (Par défaut)"
    },
    "models/gemini-3.5-flash": {
      displayName: "Gemini 3.5 Flash",
      description: "Modèle standard pour le texte, le code et le raisonnement de base"
    },
    "models/gemini-3.1-flash-lite": {
      displayName: "Gemini 3.1 Flash-Lite",
      description: "Modèle très rapide et efficace pour les tâches à faible latence"
    },
    "models/gemini-3.1-pro-preview": {
      displayName: "Gemini 3.1 Pro Preview",
      description: "Modèle pro avancé pour le raisonnement complexe, les mathématiques et l'analyse approfondie du code"
    },
    "models/gemini-3.1-flash-lite-image": {
      displayName: "Gemini 3.1 Flash-Lite Image",
      description: "Modèle standard de génération et de traitement d'images"
    },
    "models/gemini-3.1-flash-image": {
      displayName: "Gemini 3.1 Flash Image",
      description: "Modèle de génération d'images de haute qualité"
    }
  }
};

export default function SettingsModal({
  customEndpoints,
  onUpdateCustomEndpoints,
  selectedEndpointId,
  onSelectEndpointId,
  isOpen,
  onClose,
  apiKey,
  onSaveApiKey,
  selectedModel,
  onSelectModel,
  availableModels,
  loading,
  error,
  onRefreshModels,
  lang,
  bypassCache,
  onToggleBypassCache,
  // Persona Props
  selectedPersonaId,
  onSelectPersonaId,
  customPersonas,
  onUpdateCustomPersonas,
  // Target Audience Props
  selectedAudienceId,
  onSelectAudienceId,
  customAudiences,
  onUpdateCustomAudiences,
  // Search Sources
  searchSources,
  onSearchSourcesChange,
  trendingTimeframe,
  onTrendingTimeframeChange,
}: SettingsModalProps) {
  const [tempKey, setTempKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"engine" | "persona" | "sources">("engine");

  const [editingEndpoint, setEditingEndpoint] = useState<AiEndpoint | null>(null);
  const [endpointName, setEndpointName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");


  // Persona states
  const [editingPersona, setEditingPersona] = useState<AIPersona | null>(null);
  const [formName, setFormName] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formError, setFormError] = useState("");

  // Target Audience states
  const [editingAudience, setEditingAudience] = useState<AITargetAudience | null>(null);
  const [formAudienceName, setFormAudienceName] = useState("");
  const [formAudiencePrompt, setFormAudiencePrompt] = useState("");
  const [formAudienceError, setFormAudienceError] = useState("");

  const [isGeneratingPersona, setIsGeneratingPersona] = useState(false);
  const [isGeneratingAudience, setIsGeneratingAudience] = useState(false);

  // Select active language dictionary
  const activeLang = TRANSLATIONS[lang] ? lang : "en";
  const t = TRANSLATIONS[activeLang];

  const handleAIGeneratePersona = async () => {
    if (!formName.trim()) {
      setFormError(t.enterNameFirstError);
      return;
    }
    setFormError("");
    setIsGeneratingPersona(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) headers["x-gemini-key"] = apiKey;
      if (selectedModel) headers["x-gemini-model"] = selectedModel;

      const response = await fetch("/api/generate-prompt", {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "persona",
          input: formName.trim(),
          lang: lang,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate prompt. Status: ${response.status}`);
      }

      const data = await response.json();
      if (data.name) setFormName(data.name);
      if (data.prompt) setFormPrompt(data.prompt);
    } catch (err: any) {
      console.log("AI Persona generation error:", err);
      setFormError(activeLang === "ja" ? "AI生成中にエラーが発生しました。" : "An error occurred during AI generation.");
    } finally {
      setIsGeneratingPersona(false);
    }
  };

  const handleAIGenerateAudience = async () => {
    if (!formAudienceName.trim()) {
      setFormAudienceError(t.enterNameFirstError);
      return;
    }
    setFormAudienceError("");
    setIsGeneratingAudience(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) headers["x-gemini-key"] = apiKey;
      if (selectedModel) headers["x-gemini-model"] = selectedModel;

      const response = await fetch("/api/generate-prompt", {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "audience",
          input: formAudienceName.trim(),
          lang: lang,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate prompt. Status: ${response.status}`);
      }

      const data = await response.json();
      if (data.name) setFormAudienceName(data.name);
      if (data.prompt) setFormAudiencePrompt(data.prompt);
    } catch (err: any) {
      console.log("AI Audience generation error:", err);
      setFormAudienceError(activeLang === "ja" ? "AI生成中にエラーが発生しました。" : "An error occurred during AI generation.");
    } finally {
      setIsGeneratingAudience(false);
    }
  };

  const handleStartCreate = () => {
    setEditingPersona({ id: "", name: "", prompt: "" });
    setFormName("");
    setFormPrompt("");
    setFormError("");
  };

  const handleStartEdit = (p: AIPersona) => {
    setEditingPersona(p);
    setFormName(p.name);
    setFormPrompt(p.prompt);
    setFormError("");
  };

  const handleDeletePersona = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPersonas.filter((p) => p.id !== id);
    onUpdateCustomPersonas(updated);
    if (selectedPersonaId === id) {
      onSelectPersonaId("architect");
    }
  };

  const handleSavePersona = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError(activeLang === "ja" ? "名前を入力してください。" : "Please enter a name.");
      return;
    }
    if (!formPrompt.trim()) {
      setFormError(activeLang === "ja" ? "プロンプト指示を入力してください。" : "Please enter instructions.");
      return;
    }

    if (editingPersona && editingPersona.id) {
      const updated = customPersonas.map((p) =>
        p.id === editingPersona.id ? { ...p, name: formName.trim(), prompt: formPrompt.trim() } : p
      );
      onUpdateCustomPersonas(updated);
    } else {
      const newPersona: AIPersona = {
        id: "custom_" + Date.now(),
        name: formName.trim(),
        prompt: formPrompt.trim(),
        isPreset: false,
      };
      onUpdateCustomPersonas([...customPersonas, newPersona]);
      onSelectPersonaId(newPersona.id);
    }

    setEditingPersona(null);
    setFormName("");
    setFormPrompt("");
    setFormError("");
  };

  // Audience handlers
  const handleStartCreateAudience = () => {
    setEditingAudience({ id: "", name: "", prompt: "" });
    setFormAudienceName("");
    setFormAudiencePrompt("");
    setFormAudienceError("");
  };

  const handleStartEditAudience = (a: AITargetAudience) => {
    setEditingAudience(a);
    setFormAudienceName(a.name);
    setFormAudiencePrompt(a.prompt);
    setFormAudienceError("");
  };

  const handleDeleteAudience = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customAudiences.filter((a) => a.id !== id);
    onUpdateCustomAudiences(updated);
    if (selectedAudienceId === id) {
      onSelectAudienceId("beginner");
    }
  };

  const handleSaveAudience = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAudienceName.trim()) {
      setFormAudienceError(activeLang === "ja" ? "名前を入力してください。" : "Please enter a name.");
      return;
    }
    if (!formAudiencePrompt.trim()) {
      setFormAudienceError(activeLang === "ja" ? "プロンプト指示を入力してください。" : "Please enter instructions.");
      return;
    }

    if (editingAudience && editingAudience.id) {
      const updated = customAudiences.map((a) =>
        a.id === editingAudience.id ? { ...a, name: formAudienceName.trim(), prompt: formAudiencePrompt.trim() } : a
      );
      onUpdateCustomAudiences(updated);
    } else {
      const newAudience: AITargetAudience = {
        id: "custom_" + Date.now(),
        name: formAudienceName.trim(),
        prompt: formAudiencePrompt.trim(),
        isPreset: false,
      };
      onUpdateCustomAudiences([...customAudiences, newAudience]);
      onSelectAudienceId(newAudience.id);
    }

    setEditingAudience(null);
    setFormAudienceName("");
    setFormAudiencePrompt("");
    setFormAudienceError("");
  };

  // Helper to retrieve localized model names and descriptions
  const getModelText = (modelName: string, defaultDisplayName: string, defaultDescription: string) => {
    const localized = LOCALIZED_MODEL_INFO[activeLang]?.[modelName];
    if (localized) {
      return localized;
    }
    return {
      displayName: defaultDisplayName,
      description: defaultDescription === "Retrieved dynamically from Gemini API" ? t.fallbackDesc : defaultDescription,
    };
  };

  // Filter models: show all models when search is empty,
  // or search/narrow down across ALL available models when a query is entered.
  const filteredModels = useMemo(() => {
    const trimmedQuery = searchQuery.trim().toLowerCase();
    
    if (!trimmedQuery) {
      return availableModels;
    }
    
    return availableModels.filter((model) => {
      const mText = getModelText(model.name, model.displayName, model.description || "");
      return (
        mText.displayName.toLowerCase().includes(trimmedQuery) ||
        model.name.toLowerCase().includes(trimmedQuery) ||
        mText.description.toLowerCase().includes(trimmedQuery)
      );
    });
  }, [availableModels, searchQuery, selectedModel, activeLang]);

  // Sync tempKey with apiKey when the modal is opened or apiKey changes
  React.useEffect(() => {
    if (isOpen) {
      setTempKey(apiKey);
    }
  }, [isOpen, apiKey]);

  if (!isOpen) return null;

  const handleKeySave = () => {
    onSaveApiKey(tempKey.trim());
  };

  const handleResetToDefault = () => {
    onSelectModel("models/gemini-flash-lite-latest");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 sm:p-6 transition-all duration-300"
      id="settings-modal-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200"
        id="settings-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0"
          id="settings-header"
        >
          <div className="flex items-center space-x-2 text-slate-800">
            <Sliders className="w-5 h-5 text-indigo-600 shrink-0" />
            <div>
              <h2 className="text-base font-bold">{t.title}</h2>
              <p className="text-[10px] text-slate-400">{t.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition cursor-pointer"
            id="settings-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector Bar */}
        <div className="flex border-b border-slate-100 px-6 bg-slate-50/50 shrink-0 overflow-x-auto whitespace-nowrap" id="settings-tabs-container">
          <button
            type="button"
            onClick={() => {
              setActiveTab("engine");
              setEditingPersona(null);
            }}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer flex-1 sm:flex-none text-center ${
              activeTab === "engine"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            id="settings-tab-engine"
          >
            <span className="hidden sm:inline">{t.title}</span>
            <span className="sm:hidden">{activeLang === "ja" ? "エンジン設定" : "Engine"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("persona");
              setEditingPersona(null);
            }}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center justify-center cursor-pointer flex-1 sm:flex-none text-center ${
              activeTab === "persona"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            id="settings-tab-persona"
          >
            <User className="w-3.5 h-3.5 mr-1 sm:mr-1.5 shrink-0" />
            <span className="hidden sm:inline">{activeLang === "ja" ? "AI設定 (ペルソナ/ターゲット)" : "AI Settings"}</span>
            <span className="sm:hidden">{activeLang === "ja" ? "ペルソナ/読者" : "Persona/Audience"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("sources");
              setEditingAudience(null);
              setEditingPersona(null);
            }}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center justify-center cursor-pointer flex-1 sm:flex-none text-center ${
              activeTab === "sources"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            id="settings-tab-sources"
          >
            <Search className="w-3.5 h-3.5 mr-1 sm:mr-1.5 shrink-0" />
            <span className="hidden sm:inline">{activeLang === "ja" ? "検索ソース" : "Search Sources"}</span>
            <span className="sm:hidden">{activeLang === "ja" ? "検索ソース" : "Sources"}</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6" id="settings-content-wrapper">
          {activeTab === "engine" && (
            <>

              {/* Section 0: AI Endpoint Config */}
              <div className="space-y-3 pb-4 border-b border-slate-100" id="settings-section-endpoint">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
                  AI Engine
                </h3>
                
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[...PRESET_ENDPOINTS, ...customEndpoints].map(ep => (
                      <div 
                        key={ep.id}
                        onClick={() => onSelectEndpointId(ep.id)}
                        className={`relative flex flex-col p-3 rounded-xl border text-left cursor-pointer transition ${selectedEndpointId === ep.id ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200 hover:border-slate-300"}`}
                      >
                        <div className="flex justify-between items-start mb-1 pr-14">
                          <span className={`text-xs font-bold ${selectedEndpointId === ep.id ? "text-indigo-900" : "text-slate-700"} truncate`}>
                            {ep.name}
                          </span>
                          {selectedEndpointId === ep.id && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 ml-1" />}
                        </div>
                        <span className="text-[10px] text-slate-500 truncate pr-14">{ep.isPreset ? (ep.type === 'gemini' ? 'Native SDK' : ep.url) : ep.url}</span>
                        
                        {!ep.isPreset && (
                           <div className="absolute top-2 right-2 flex space-x-1 bg-white/80 backdrop-blur-sm p-0.5 rounded shadow-sm border border-slate-100">
                             <button onClick={(e) => { e.stopPropagation(); setEditingEndpoint(ep); setEndpointName(ep.name); setEndpointUrl(ep.url); }} className="p-1 text-slate-400 hover:text-indigo-600 transition hover:bg-slate-50 rounded"><Edit2 className="w-3 h-3" /></button>
                             <button onClick={(e) => { e.stopPropagation(); onUpdateCustomEndpoints(customEndpoints.filter(x => x.id !== ep.id)); if (selectedEndpointId === ep.id) onSelectEndpointId('gemini-default'); }} className="p-1 text-slate-400 hover:text-red-500 transition hover:bg-slate-50 rounded"><Trash2 className="w-3 h-3" /></button>
                           </div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {editingEndpoint ? (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 mt-3">
                      <input value={endpointName} onChange={e=>setEndpointName(e.target.value)} placeholder="Endpoint Name (e.g. Local LLM)" className="w-full text-xs p-2 rounded border border-slate-200 outline-none focus:border-indigo-500" />
                      <input value={endpointUrl} onChange={e=>setEndpointUrl(e.target.value)} placeholder="OpenAI-compatible URL (e.g. http://localhost:11434/v1)" className="w-full text-xs p-2 rounded border border-slate-200 outline-none focus:border-indigo-500" />
                      <div className="flex space-x-2 justify-end">
                        <button onClick={() => setEditingEndpoint(null)} className="px-3 py-1 text-[10px] text-slate-500 hover:bg-slate-200 rounded font-bold transition">Cancel</button>
                        <button onClick={() => {
                          const exists = customEndpoints.some(e => e.id === editingEndpoint.id);
                          let updated;
                          if (exists) {
                            updated = customEndpoints.map(e => e.id === editingEndpoint.id ? { ...e, name: endpointName.trim() || 'Custom Endpoint', url: endpointUrl.trim(), type: 'openai' } : e);
                          } else {
                            updated = [...customEndpoints, { id: editingEndpoint.id, name: endpointName.trim() || 'Custom Endpoint', url: endpointUrl.trim(), type: 'openai' }];
                          }
                          onUpdateCustomEndpoints(updated);
                          setEditingEndpoint(null);
                          setTimeout(() => onSelectEndpointId(editingEndpoint.id), 0);
                        }} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] rounded font-bold transition">Save</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => {
                      setEditingEndpoint({ id: 'custom-' + Date.now(), name: '', url: '', type: 'openai' });
                      setEndpointName('');
                      setEndpointUrl('');
                    }} className="w-full py-2 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition flex items-center justify-center space-x-1">
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Custom Endpoint (OpenAI format)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Section 1: API Key Config */}
              <div className="space-y-3" id="settings-section-api-key">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                  <Key className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
                  {t.apiKeyHeader}
                </h3>
                
                
                
                <p className="text-xs text-slate-500 leading-relaxed flex flex-col gap-1">
                  <span>{t.apiKeyDesc}</span>
                  {selectedEndpointId === "gemini-default" && (
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">
                      {activeLang === "ja" ? "→ Google Gemini の APIキーを取得する" : "→ Get Google Gemini API Key here"}
                    </a>
                  )}
                  {selectedEndpointId === "openai-default" && (
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">
                      {activeLang === "ja" ? "→ OpenAI の APIキーを取得する" : "→ Get OpenAI API Key here"}
                    </a>
                  )}
                  {selectedEndpointId === "anthropic-default" && (
                    <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">
                      {activeLang === "ja" ? "→ Anthropic の APIキーを取得する" : "→ Get Anthropic API Key here"}
                    </a>
                  )}
                </p>



                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey ? "text" : "password"}
                      value={tempKey}
                      onChange={(e) => setTempKey(e.target.value)}
                      placeholder={t.apiKeyPlaceholder}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-xs text-slate-700 rounded-xl px-4 py-2.5 pr-10 outline-none transition"
                      id="settings-api-key-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                      id="settings-toggle-visibility-btn"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleKeySave}
                    disabled={tempKey.trim() === apiKey}
                    className={`text-xs font-bold px-4 py-2.5 rounded-xl border shadow-sm transition shrink-0 cursor-pointer ${
                      tempKey.trim() === apiKey
                        ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700"
                    }`}
                    id="settings-api-key-save-btn"
                  >
                    {t.apply}
                  </button>
                </div>
                {apiKey && (
                  <p className="text-[10px] text-green-600 flex items-center font-semibold bg-green-50/70 border border-green-100 rounded-lg px-2.5 py-1">
                    <Check className="w-3 h-3 mr-1" /> {t.keyActive}
                  </p>
                )}

                {/* Bypass Cache Toggle */}
                <div className="flex items-start justify-between bg-slate-50 border border-slate-100 rounded-2xl p-4 space-x-4">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-700">{t.bypassCacheLabel}</h4>
                    <p className="text-[10px] text-slate-400 leading-relaxed">{t.bypassCacheDesc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={bypassCache}
                      onChange={(e) => onToggleBypassCache(e.target.checked)}
                      className="sr-only peer"
                      id="settings-bypass-cache-checkbox"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>

              <hr className="border-slate-100" />

              {/* Section 2: Model Picker */}
              <div className="space-y-4" id="settings-section-model-picker">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                    <Cpu className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
                    {t.selectModelHeader}
                  </h3>
                  
                  <button
                    onClick={() => {
                      const trimmedKey = tempKey.trim();
                      if (trimmedKey !== apiKey) {
                        onSaveApiKey(trimmedKey);
                      }
                      onRefreshModels(trimmedKey);
                    }}
                    disabled={loading}
                    className="inline-flex items-center space-x-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:text-slate-400 transition cursor-pointer"
                    id="settings-refresh-models-btn"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                    <span className="text-[11px] font-semibold">{t.refetchList}</span>
                  </button>
                </div>

                {/* Models Search Field */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder={t.searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-xs text-slate-700 rounded-xl pl-9 pr-4 py-2 outline-none transition"
                    id="settings-models-search-input"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {t.clear}
                    </button>
                  )}
                </div>

                {/* Error block */}
                {error && (
                  <div
                    className="flex items-start space-x-2 p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs"
                    id="settings-models-error-alert"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">{t.errorHeader}</p>
                      <p className="text-[10px] opacity-90">{error}</p>
                    </div>
                  </div>
                )}

                {/* Models List */}
                <div
                  className="border border-slate-100 rounded-2xl divide-y divide-slate-100 max-h-[220px] overflow-y-auto bg-slate-50"
                  id="settings-models-list-box"
                >
                  {loading ? (
                    <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center space-y-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
                      <span>{t.fetchingModels}</span>
                    </div>
                  ) : filteredModels.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      {t.noModels}
                    </div>
                  ) : (
                    filteredModels.map((model) => {
                      const isActive = selectedModel === model.name;
                      const mText = getModelText(model.name, model.displayName, model.description || "");
                      return (
                        <div
                          key={model.name}
                          onClick={() => onSelectModel(model.name)}
                          className={`p-3 text-left transition cursor-pointer select-none ${
                            isActive
                              ? "bg-indigo-50/70 hover:bg-indigo-50"
                              : "hover:bg-slate-100 bg-white"
                          }`}
                          id={`model-option-${model.name.replace(/\//g, "-")}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-0.5 pr-2">
                              <div className="flex items-center space-x-1.5">
                                <span className={`text-xs font-bold ${isActive ? "text-indigo-700" : "text-slate-700"}`}>
                                  {mText.displayName}
                                </span>
                                {model.name === "models/gemini-flash-lite-latest" && (
                                  <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-mono font-medium border border-slate-200">
                                    {t.defaultTag}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 block font-mono">
                                {model.name}
                              </span>
                              <span className="text-[10px] text-slate-500 block leading-normal mt-1">
                                {mText.description}
                              </span>
                            </div>
                            {isActive && (
                              <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Model stats & reset */}
                <div className="flex justify-between items-center text-[10px] text-slate-400 px-1 pt-1">
                  <span>{t.activeLabel}<strong className="text-slate-600 font-semibold">{selectedModel}</strong></span>
                  {selectedModel !== "models/gemini-flash-lite-latest" && (
                    <button
                      type="button"
                      onClick={handleResetToDefault}
                      className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                      id="settings-reset-model-btn"
                    >
                      {t.resetToDefault}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === "persona" && (
            /* Section 3: AI Persona Config */
            <div className="space-y-4" id="settings-section-persona">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                  <User className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
                  {t.personaTitle}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {t.personaDesc}
                </p>
              </div>

              {/* Persona Form editor (when adding or editing) */}
              {editingPersona ? (
                <form onSubmit={handleSavePersona} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3" id="settings-persona-form">
                  <h4 className="text-xs font-bold text-slate-700">
                    {editingPersona.id ? t.editPersonaHeader : t.addPersonaHeader}
                  </h4>
                  {formError && (
                    <p className="text-[10px] text-red-500 font-semibold">{formError}</p>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      {t.personaNameLabel}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder={t.placeholderName}
                        className="flex-1 min-w-0 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-xs text-slate-700 rounded-xl px-3 py-2 outline-none transition"
                        id="settings-persona-name-input"
                      />
                      <button
                        type="button"
                        onClick={handleAIGeneratePersona}
                        disabled={isGeneratingPersona || !formName.trim()}
                        className="inline-flex items-center space-x-1 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 disabled:bg-slate-100 disabled:text-slate-400 text-indigo-600 disabled:cursor-not-allowed rounded-xl text-xs font-semibold cursor-pointer transition shrink-0 border border-indigo-100/50"
                        title={t.aiGenerateHint}
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${isGeneratingPersona ? "animate-spin text-indigo-500" : ""}`} />
                        <span>{isGeneratingPersona ? t.aiGenerating : t.generateWithAI}</span>
                      </button>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-normal italic pl-1">
                      {t.aiGenerateHint}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      {t.personaPromptLabel}
                    </label>
                    <textarea
                      rows={4}
                      value={formPrompt}
                      onChange={(e) => setFormPrompt(e.target.value)}
                      placeholder={t.placeholderPrompt}
                      className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-xs text-slate-700 rounded-xl px-3 py-2 outline-none transition resize-none leading-relaxed"
                      id="settings-persona-prompt-input"
                    />
                  </div>
                  <div className="flex justify-end space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingPersona(null)}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-3 py-1.5 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                    >
                      {t.cancel}
                    </button>
                    <button
                      type="submit"
                      className="text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl transition shadow-sm cursor-pointer"
                    >
                      {t.save}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {t.selectPersonaHeader}
                  </span>
                  <button
                    type="button"
                    onClick={handleStartCreate}
                    className="inline-flex items-center space-x-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                    id="settings-add-persona-btn"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.addPersona}</span>
                  </button>
                </div>
              )}

              {/* Persona List view */}
              {!editingPersona && (
                <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 overflow-hidden bg-slate-50 max-h-[280px] overflow-y-auto" id="settings-persona-list">
                  {/* Presets */}
                  {PRESET_PERSONAS.map((p) => {
                    const isSelected = selectedPersonaId === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => onSelectPersonaId(p.id)}
                        className={`p-3 text-left transition cursor-pointer flex items-start justify-between select-none ${
                          isSelected ? "bg-indigo-50/70 hover:bg-indigo-50" : "hover:bg-slate-100 bg-white"
                        }`}
                        id={`persona-option-${p.id}`}
                      >
                        <div className="space-y-0.5 pr-2">
                          <div className="flex items-center space-x-1.5">
                            <span className={`text-xs font-bold ${isSelected ? "text-indigo-700" : "text-slate-700"}`}>
                              {p.name}
                            </span>
                            <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full font-mono font-medium border border-slate-200">
                              {t.presetBadge}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 mt-1">
                            {p.prompt}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Customs */}
                  {customPersonas.length > 0 && (
                    customPersonas.map((p) => {
                      const isSelected = selectedPersonaId === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => onSelectPersonaId(p.id)}
                          className={`p-3 text-left transition cursor-pointer flex items-start justify-between select-none ${
                            isSelected ? "bg-indigo-50/70 hover:bg-indigo-50" : "hover:bg-slate-100 bg-white"
                          }`}
                          id={`persona-option-${p.id}`}
                        >
                          <div className="space-y-0.5 pr-2 flex-1 min-w-0">
                            <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                              <span className={`text-xs font-bold ${isSelected ? "text-indigo-700" : "text-slate-700"} truncate max-w-[180px]`}>
                                {p.name}
                              </span>
                              <span className="text-[9px] bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full font-mono font-medium border border-indigo-100">
                                {t.customBadge}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 mt-1">
                              {p.prompt}
                            </p>
                          </div>
                          
                          <div className="flex items-center space-x-1 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEdit(p);
                              }}
                              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition cursor-pointer"
                              title={t.editPersona}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeletePersona(p.id, e)}
                              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-red-600 transition cursor-pointer"
                              title={t.deletePersona}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* No Customs empty state hint */}
              {!editingPersona && customPersonas.length === 0 && (
                <p className="text-[10px] text-slate-400 text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 leading-relaxed px-4">
                  {t.noCustom}
                </p>
              )}
            </div>
          )}

          {activeTab === "persona" && (
            /* Section 4: Target Audience Config */
            <div className="space-y-4 pt-8 border-t border-slate-200 mt-8" id="settings-section-audience">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                  <Users className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
                  {t.audienceTitle}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {t.audienceDesc}
                </p>
              </div>

              {/* Audience Form editor (when adding or editing) */}
              {editingAudience ? (
                <form onSubmit={handleSaveAudience} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3" id="settings-audience-form">
                  <h4 className="text-xs font-bold text-slate-700">
                    {editingAudience.id ? t.editAudienceHeader : t.addAudienceHeader}
                  </h4>
                  {formAudienceError && (
                    <p className="text-[10px] text-red-500 font-semibold">{formAudienceError}</p>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      {t.audienceNameLabel}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formAudienceName}
                        onChange={(e) => setFormAudienceName(e.target.value)}
                        placeholder={t.placeholderAudienceName}
                        className="flex-1 min-w-0 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-xs text-slate-700 rounded-xl px-3 py-2 outline-none transition"
                        id="settings-audience-name-input"
                      />
                      <button
                        type="button"
                        onClick={handleAIGenerateAudience}
                        disabled={isGeneratingAudience || !formAudienceName.trim()}
                        className="inline-flex items-center space-x-1 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 disabled:bg-slate-100 disabled:text-slate-400 text-indigo-600 disabled:cursor-not-allowed rounded-xl text-xs font-semibold cursor-pointer transition shrink-0 border border-indigo-100/50"
                        title={t.aiGenerateHint}
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${isGeneratingAudience ? "animate-spin text-indigo-500" : ""}`} />
                        <span>{isGeneratingAudience ? t.aiGenerating : t.generateWithAI}</span>
                      </button>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-normal italic pl-1">
                      {t.aiGenerateHint}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      {t.audiencePromptLabel}
                    </label>
                    <textarea
                      rows={4}
                      value={formAudiencePrompt}
                      onChange={(e) => setFormAudiencePrompt(e.target.value)}
                      placeholder={t.placeholderAudiencePrompt}
                      className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-xs text-slate-700 rounded-xl px-3 py-2 outline-none transition resize-none leading-relaxed"
                      id="settings-audience-prompt-input"
                    />
                  </div>
                  <div className="flex justify-end space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingAudience(null)}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-3 py-1.5 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                    >
                      {t.cancel}
                    </button>
                    <button
                      type="submit"
                      className="text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl transition shadow-sm cursor-pointer"
                    >
                      {t.save}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {t.selectAudienceHeader}
                  </span>
                  <button
                    type="button"
                    onClick={handleStartCreateAudience}
                    className="inline-flex items-center space-x-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                    id="settings-add-audience-btn"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.addAudience}</span>
                  </button>
                </div>
              )}

              {/* Audience List view */}
              {!editingAudience && (
                <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 overflow-hidden bg-slate-50 max-h-[280px] overflow-y-auto" id="settings-audience-list">
                  {/* Presets */}
                  {PRESET_AUDIENCES.map((a) => {
                    const isSelected = selectedAudienceId === a.id;
                    return (
                      <div
                        key={a.id}
                        onClick={() => onSelectAudienceId(a.id)}
                        className={`p-3 text-left transition cursor-pointer flex items-start justify-between select-none ${
                          isSelected ? "bg-indigo-50/70 hover:bg-indigo-50" : "hover:bg-slate-100 bg-white"
                        }`}
                        id={`audience-option-${a.id}`}
                      >
                        <div className="space-y-0.5 pr-2">
                          <div className="flex items-center space-x-1.5">
                            <span className={`text-xs font-bold ${isSelected ? "text-indigo-700" : "text-slate-700"}`}>
                              {a.name}
                            </span>
                            <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full font-mono font-medium border border-slate-200">
                              {t.presetBadge}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 mt-1">
                            {a.prompt}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Customs */}
                  {customAudiences.length > 0 && (
                    customAudiences.map((a) => {
                      const isSelected = selectedAudienceId === a.id;
                      return (
                        <div
                          key={a.id}
                          onClick={() => onSelectAudienceId(a.id)}
                          className={`p-3 text-left transition cursor-pointer flex items-start justify-between select-none ${
                            isSelected ? "bg-indigo-50/70 hover:bg-indigo-50" : "hover:bg-slate-100 bg-white"
                          }`}
                          id={`audience-option-${a.id}`}
                        >
                          <div className="space-y-0.5 pr-2 flex-1 min-w-0">
                            <div className="flex items-center space-x-1.5 flex-wrap gap-y-1 flex-row">
                              <span className={`text-xs font-bold ${isSelected ? "text-indigo-700" : "text-slate-700"} truncate max-w-[180px]`}>
                                {a.name}
                              </span>
                              <span className="text-[9px] bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full font-mono font-medium border border-indigo-100">
                                {t.customBadge}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 mt-1">
                              {a.prompt}
                            </p>
                          </div>
                          
                          <div className="flex items-center space-x-1 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEditAudience(a);
                              }}
                              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition cursor-pointer"
                              title={t.editAudience}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteAudience(a.id, e)}
                              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-red-600 transition cursor-pointer"
                              title={t.deleteAudience}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* No Customs empty state hint */}
              {!editingAudience && customAudiences.length === 0 && (
                <p className="text-[10px] text-slate-400 text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 leading-relaxed px-4">
                  {t.noCustomAudience}
                </p>
              )}
            </div>
          )}
          
          {activeTab === "sources" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300" id="settings-sources-tab">
              <div className="space-y-2 mb-4">
                <h3 className="text-xs font-bold text-slate-800">
                  {activeLang === "ja" ? "検索ソース設定" : "Search Source Settings"}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {activeLang === "ja"
                    ? "検索対象のプラットフォームを選択します。複数選択すると同時に検索できます。"
                    : "Select the platforms to search. You can select multiple for concurrent search."}
                </p>
              </div>
              
              <div className="space-y-3 mb-6">
                {/* GitHub */}
                <label className="flex items-center p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
                  <input 
                    type="checkbox"
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    checked={searchSources.includes("github")}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onSearchSourcesChange([...searchSources, "github"]);
                      } else {
                        // Prevent unchecking if it's the last option
                        if (searchSources.length > 1) {
                          onSearchSourcesChange(searchSources.filter(s => s !== "github"));
                        }
                      }
                    }}
                  />
                  <span className="ml-3 text-sm font-semibold text-slate-700">GitHub</span>
                </label>
                
                {/* GitLab */}
                <label className="flex items-center p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
                  <input 
                    type="checkbox"
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    checked={searchSources.includes("gitlab")}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onSearchSourcesChange([...searchSources, "gitlab"]);
                      } else {
                        if (searchSources.length > 1) {
                          onSearchSourcesChange(searchSources.filter(s => s !== "gitlab"));
                        }
                      }
                    }}
                  />
                  <span className="ml-3 text-sm font-semibold text-slate-700">GitLab</span>
                </label>
              </div>

              <div className="space-y-2 mb-4 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-800">
                  {activeLang === "ja" ? "トレンドの期間" : "Trending Timeframe"}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-3">
                  {activeLang === "ja"
                    ? "トップページに表示するトレンドの期間（日・週・月）を選択します。"
                    : "Select the timeframe for trending repositories displayed on the home page."}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onTrendingTimeframeChange("day")}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${
                      trendingTimeframe === "day"
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {activeLang === "ja" ? "今日 (Day)" : "Today"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onTrendingTimeframeChange("week")}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${
                      trendingTimeframe === "week"
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {activeLang === "ja" ? "今週 (Week)" : "This Week"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onTrendingTimeframeChange("month")}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${
                      trendingTimeframe === "month"
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {activeLang === "ja" ? "今月 (Month)" : "This Month"}
                  </button>
                </div>
              </div>
              
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 text-right shrink-0"
          id="settings-footer"
        >
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-4 py-2 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            id="settings-close-panel-btn"
          >
            {t.done}
          </button>
        </div>
      </div>
    </div>
  );
}
