cls

# How many times to query clockspeed
$count = 100
# Interval in ms
$interval = 50;


# Little helper to add colours to output
filter ColorPattern( [string]$Pattern, [ConsoleColor]$Color, [switch]$SimpleMatch ) {
  if( $SimpleMatch ) { $Pattern = [regex]::Escape( $Pattern ) }

  $split = $_ -split $Pattern
  $found = [regex]::Matches( $_, $Pattern, 'IgnoreCase' )
  for( $i = 0; $i -lt $split.Count; ++$i ) {
    Write-Host $split[$i] -NoNewline
    Write-Host $found[$i] -NoNewline -ForegroundColor $Color
  }

  Write-Host
}

#Get Maximum Clock Speed (once because WMI is slow)
$maxClockSpeed = (get-wmiobject Win32_Processor).MaxClockSpeed

#default color
$highlighColor = 'Green'

function GetClockSpeed()
{
	$freq = Get-Counter -Counter "\Processor Information(*)\Processor Frequency"
	$item = New-Object  System.Object
	
	foreach ($cpu in $freq.CounterSamples)
	{
		$procNum = ([RegEx]::Match($cpu.Path, '.+\((\d+,\d+)\).*')).Groups[1].Value
		if ($procNum)
		{
			$item | Add-Member -Type NoteProperty –Name $procNum -Value $cpu.CookedValue
		}
	}
	
	$item
}

for ($i=0 ; $i -lt $count ; $i++)
{
	$list = GetClockSpeed 
	cls

	$firstCoreSpeed = ($list | Select-Object -ExpandProperty "0,0")
	# Just some formatting magic, make it green if full speed and red otherwise
	if ($firstCoreSpeed -lt $maxClockSpeed) { $highlighColor = 'Red' } else { $highlighColor = 'Green' }

	"Actual: {0} Mhz Maximum: {1} Mhz -> {2:P0}" -f $firstCoreSpeed, $maxClockSpeed, ($firstCoreSpeed / $maxClockSpeed) | ColorPattern -Pattern '\d+ %' -Color $highlighColor
	"Speed per Core:"
	
	$list | Format-Table -AutoSize | Out-String | ColorPattern -Pattern '\d\d+' -Color $highlighColor #-SimpleMatch
	
	
	# Sleep until next interval
	Start-Sleep -Milliseconds $interval
}