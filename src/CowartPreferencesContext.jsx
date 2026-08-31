import { createContext, useContext } from 'react'

const EMPTY_COWART_PREFERENCES = {
  version: 1,
  toolbarLayout: null,
  themePreference: null
}

const CowartPreferencesContext = createContext({
  preferences: EMPTY_COWART_PREFERENCES,
  updatePreferences() {}
})

/** 向 tldraw 的静态组件覆盖层提供同一份全局偏好和保存入口。 */
export function CowartPreferencesProvider({ children, preferences, updatePreferences }) {
  return (
    <CowartPreferencesContext.Provider value={{ preferences, updatePreferences }}>
      {children}
    </CowartPreferencesContext.Provider>
  )
}

/** 主题和工具栏都通过此 hook 读取服务端偏好，避免各自维护互相冲突的状态。 */
export function useCowartPreferences() {
  return useContext(CowartPreferencesContext)
}
