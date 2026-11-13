Pod::Spec.new do |s|
  s.name           = 'ZapbarDiscovery'
  s.version        = '1.0.0'
  s.summary        = 'Zapbar: Bonjour discovery of HEOS soundbars'
  s.description    = 'Zapbar local Expo module: Bonjour discovery of HEOS soundbars'
  s.license        = 'UNLICENSED'
  s.author         = 'Zapbar'
  s.homepage       = 'https://zapbar.app'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
