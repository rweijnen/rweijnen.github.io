cls
function Sort-Binary {
    param(
        [Parameter(Mandatory = $true,  ValueFromPipeline = $true)][HashTable]$HashTable,
        [Switch]$Descending
    )
    $keys = $HashTable.Keys | ForEach {$_}                                     
    for ($i = 0; $i -lt $keys.Count - 1; $i++) {
        for ($j = $i + 1; $j -lt $keys.Count; $j++) {
            if ($Descending) {$swap = [String]::CompareOrdinal($keys[$i], $keys[$j]) -lt 0} else {$swap = [String]::CompareOrdinal($keys[$i], $keys[$j]) -gt 0}		
            if ($swap) {$keys[$i], $keys[$j] = $keys[$j], $keys[$i]}
        }
    }
    
	$list = New-Object System.Collections.Specialized.OrderedDictionary
	$keys | ForEach { $list.Add($_, $HashTable[$_]) }
	
	return $list
}

$params = @{}
$params.Add("AssociateTag", "dummy")
$params.Add("AWSAccessKeyId", "AKIAIOSFODNN7EXAMPLE")
$params.Add("IdType", "0679722769")
$params.Add("Operation", "ItemLookup")

$params | Sort-Binary