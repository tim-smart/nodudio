jQuery.fn.disableTextSelect = ->
  @each ->
    if jQuery.browser.mozilla
      jQuery(this).bind 'MozUserSelect', 'none'
    else if jQuery.browser.msie
      jQuery(this).bind 'selectstart', -> false
    else
      jQuery(this).mousedown -> false

$('#content').disableTextSelect()

$('song').each (i) ->
  if i % 2
    @className = 'odd'
