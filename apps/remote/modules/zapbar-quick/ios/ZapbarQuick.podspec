Pod::Spec.new do |s|
  s.name           = 'ZapbarQuick'
  s.version        = '1.0.0'
  s.summary        = 'Zapbar: Quick-control stubs (widgets arrive in plan 6c)'
  s.description    = 'Zapbar local Expo module: Quick-control stubs (widgets arrive in plan 6c)'
  s.license        = 'UNLICENSED'
  s.author         = 'Zapbar'
  s.homepage       = 'https://zapbar.app'
  s.frameworks     = 'WidgetKit'
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
