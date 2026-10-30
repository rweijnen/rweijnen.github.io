cls

function Get-IniFile {
    param (
    	[parameter(mandatory=$true, position=0, valuefrompipelinebypropertyname=$true, valuefrompipeline=$true)][string]$FilePath
    )

	$ini = New-Object System.Collections.Specialized.OrderedDictionary
	$currentSection = New-Object System.Collections.Specialized.OrderedDictionary
	$curSectionName = "default"

	switch -regex (gc $FilePath)
	{
	    "^\[(?<Section>.*)\]"
	    {
			$ini.Add($curSectionName, $currentSection)
			
			$curSectionName = $Matches['Section']
			$currentSection = New-Object System.Collections.Specialized.OrderedDictionary	
	    }
		"(?<Key>\w+)\=(?<Value>\w+)"
		{
			# add to current section Hash Set
			$currentSection.Add($Matches['Key'], $Matches['Value'])
		}
		"^$"
		{
			# ignore blank line
		}
		 
		"(?<Key>\;)(?<Value>.*)"
		{
			$currentSection.Add($Matches['Key'], $Matches['Value'])	  
		}
			default
		{
			throw "Unidentified: $_"  # should not happen
		}
	}
	if ($ini.Keys -notcontains $curSectionName) { $ini.Add($curSectionName, $currentSection) }
	
	return $ini
}

function Out-IniFile{
    param (
    	[parameter(mandatory=$true, position=0, valuefrompipelinebypropertyname=$true, valuefrompipeline=$true)][System.Collections.Specialized.OrderedDictionary]$ini,
		[parameter(mandatory=$false,position=1, valuefrompipelinebypropertyname=$true, valuefrompipeline=$false)][String]$FilePath
    )
	
	$output = ""
	ForEach ($section in $ini.GetEnumerator())
	{
		if ($section.Name -ne "default") 
		{ 
			# insert a blank line after a section
			$sep = @{$true="";$false="`r`n"}[[String]::IsNullOrWhiteSpace($output)]
			$output += "$sep[$($section.Name)]`r`n" 
		}
		ForEach ($entry in $section.Value.GetEnumerator())
		{
			$sep = @{$true="";$false="="}[$entry.Name -eq ";"]
			$output += "$($entry.Name)$sep$($entry.Value)`r`n"
		}
		
	}
	
	$output = $output.TrimEnd("`r`n")
	if ([String]::IsNullOrEmpty($FilePath))
	{
		return $output
	}
	else
	{
		$output | Out-File -FilePath $FilePath -Encoding:ASCII
	}
}

# read ini file
$ini = Get-Ini -FilePath "C:\Windows\win.ini"

# change a value
# note that sections can have spaces so we must embed those in double quotes
# same for values because they can have digits in it.
$ini."MCI Extensions.BAK"."3gp" = "blabla"

# add a value to an existing session
$ini."MCI Extensions.BAK".Add("foo", "bar")

# create a section
$ini.Add("PowerShell", (New-Object System.Collections.Specialized.OrderedDictionary))

# add a value to the new section
$ini."PowerShell".Add("Coding", "Cool")

#write ini file back to disk
$ini | Out-Ini -FilePath "C:\Windws\win.ini"