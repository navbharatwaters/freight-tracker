import React, { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// Real data: 1,541 carrier quotes parsed from 14 Ocean Star emails.
// Observations are IRREGULAR — the agent mails when rates move, not on a schedule.
// X-axis is a true time scale so gaps between sends render as gaps.
const INDEX_DATA = [{"date":"2026-06-18","origin":"DALIAN","dest":"CHENNAI","rate20":2075,"rate40":2125,"n20":2,"n40":2},{"date":"2026-06-18","origin":"NANSHA","dest":"CHENNAI","rate20":1750,"rate40":1780,"n20":5,"n40":5},{"date":"2026-06-18","origin":"NINGBO","dest":"CHENNAI","rate20":1900,"rate40":2075,"n20":2,"n40":2},{"date":"2026-06-18","origin":"QINGDAO","dest":"CHENNAI","rate20":2083,"rate40":2233,"n20":3,"n40":3},{"date":"2026-06-18","origin":"SHANGHAI","dest":"CHENNAI","rate20":1805,"rate40":1930,"n20":5,"n40":5},{"date":"2026-06-18","origin":"SHEKOU","dest":"CHENNAI","rate20":1664,"rate40":1708,"n20":9,"n40":9},{"date":"2026-06-18","origin":"TIANJIN","dest":"CHENNAI","rate20":1850,"rate40":1900,"n20":4,"n40":4},{"date":"2026-06-18","origin":"XIAMEN","dest":"CHENNAI","rate20":1525,"rate40":1662,"n20":4,"n40":4},{"date":"2026-06-25","origin":"DALIAN","dest":"CHENNAI","rate20":1988,"rate40":2112,"n20":4,"n40":4},{"date":"2026-06-25","origin":"DALIAN","dest":"KOLKATA","rate20":2300,"rate40":2350,"n20":2,"n40":2},{"date":"2026-06-25","origin":"DALIAN","dest":"NHAVA SHEVA","rate20":2700,"rate40":2750,"n20":4,"n40":4},{"date":"2026-06-25","origin":"NANSHA","dest":"CHENNAI","rate20":1725,"rate40":1720,"n20":4,"n40":5},{"date":"2026-06-25","origin":"NANSHA","dest":"KOLKATA","rate20":1950,"rate40":2125,"n20":4,"n40":4},{"date":"2026-06-25","origin":"NANSHA","dest":"NHAVA SHEVA","rate20":2092,"rate40":2125,"n20":6,"n40":6},{"date":"2026-06-25","origin":"NINGBO","dest":"CHENNAI","rate20":2000,"rate40":2100,"n20":2,"n40":2},{"date":"2026-06-25","origin":"NINGBO","dest":"KOLKATA","rate20":1765,"rate40":2120,"n20":5,"n40":5},{"date":"2026-06-25","origin":"NINGBO","dest":"NHAVA SHEVA","rate20":2137,"rate40":2174,"n20":11,"n40":11},{"date":"2026-06-25","origin":"QINGDAO","dest":"CHENNAI","rate20":2017,"rate40":2117,"n20":3,"n40":3},{"date":"2026-06-25","origin":"QINGDAO","dest":"KOLKATA","rate20":2262,"rate40":2300,"n20":4,"n40":5},{"date":"2026-06-25","origin":"QINGDAO","dest":"NHAVA SHEVA","rate20":2500,"rate40":2531,"n20":7,"n40":8},{"date":"2026-06-25","origin":"SHANGHAI","dest":"CHENNAI","rate20":1875,"rate40":2075,"n20":6,"n40":6},{"date":"2026-06-25","origin":"SHANGHAI","dest":"KOLKATA","rate20":1795,"rate40":2210,"n20":5,"n40":5},{"date":"2026-06-25","origin":"SHANGHAI","dest":"NHAVA SHEVA","rate20":2180,"rate40":2318,"n20":8,"n40":9},{"date":"2026-06-25","origin":"SHEKOU","dest":"CHENNAI","rate20":1740,"rate40":1834,"n20":4,"n40":5},{"date":"2026-06-25","origin":"SHENZHEN","dest":"KOLKATA","rate20":2054,"rate40":2407,"n20":7,"n40":7},{"date":"2026-06-25","origin":"SHENZHEN","dest":"NHAVA SHEVA","rate20":2174,"rate40":2185,"n20":10,"n40":15},{"date":"2026-06-25","origin":"TIANJIN","dest":"CHENNAI","rate20":1817,"rate40":1850,"n20":3,"n40":3},{"date":"2026-06-25","origin":"TIANJIN","dest":"KOLKATA","rate20":2275,"rate40":2375,"n20":4,"n40":4},{"date":"2026-06-25","origin":"TIANJIN","dest":"NHAVA SHEVA","rate20":2556,"rate40":2576,"n20":5,"n40":5},{"date":"2026-06-25","origin":"XIAMEN","dest":"CHENNAI","rate20":1550,"rate40":1600,"n20":4,"n40":4},{"date":"2026-06-25","origin":"XIAMEN","dest":"KOLKATA","rate20":1912,"rate40":2275,"n20":4,"n40":4},{"date":"2026-06-25","origin":"XIAMEN","dest":"NHAVA SHEVA","rate20":2227,"rate40":2240,"n20":5,"n40":5},{"date":"2026-07-03","origin":"DALIAN","dest":"KOLKATA","rate20":1998,"rate40":2081,"n20":35,"n40":37},{"date":"2026-07-03","origin":"DALIAN","dest":"NHAVA SHEVA","rate20":2375,"rate40":2413,"n20":8,"n40":8},{"date":"2026-07-03","origin":"NANSHA","dest":"KOLKATA","rate20":1875,"rate40":2050,"n20":4,"n40":4},{"date":"2026-07-03","origin":"NANSHA","dest":"NHAVA SHEVA","rate20":1975,"rate40":2000,"n20":6,"n40":6},{"date":"2026-07-03","origin":"NINGBO","dest":"KOLKATA","rate20":1845,"rate40":2170,"n20":5,"n40":5},{"date":"2026-07-03","origin":"NINGBO","dest":"NHAVA SHEVA","rate20":1929,"rate40":1971,"n20":12,"n40":12},{"date":"2026-07-03","origin":"QINGDAO","dest":"KOLKATA","rate20":2350,"rate40":2550,"n20":3,"n40":3},{"date":"2026-07-03","origin":"QINGDAO","dest":"NHAVA SHEVA","rate20":2346,"rate40":2341,"n20":7,"n40":8},{"date":"2026-07-03","origin":"SHANGHAI","dest":"KOLKATA","rate20":1895,"rate40":2410,"n20":5,"n40":5},{"date":"2026-07-03","origin":"SHANGHAI","dest":"NHAVA SHEVA","rate20":1987,"rate40":2022,"n20":14,"n40":14},{"date":"2026-07-03","origin":"SHENZHEN","dest":"KOLKATA","rate20":1954,"rate40":2329,"n20":7,"n40":7},{"date":"2026-07-03","origin":"SHENZHEN","dest":"NHAVA SHEVA","rate20":1823,"rate40":1885,"n20":13,"n40":13},{"date":"2026-07-03","origin":"TIANJIN","dest":"KOLKATA","rate20":2300,"rate40":2375,"n20":4,"n40":4},{"date":"2026-07-03","origin":"TIANJIN","dest":"NHAVA SHEVA","rate20":2325,"rate40":2395,"n20":5,"n40":5},{"date":"2026-07-03","origin":"XIAMEN","dest":"KOLKATA","rate20":1883,"rate40":2233,"n20":3,"n40":3},{"date":"2026-07-03","origin":"XIAMEN","dest":"NHAVA SHEVA","rate20":1838,"rate40":1869,"n20":4,"n40":4},{"date":"2026-07-08","origin":"DALIAN","dest":"CHENNAI","rate20":1944,"rate40":1996,"n20":46,"n40":47},{"date":"2026-07-08","origin":"DALIAN","dest":"KOLKATA","rate20":2300,"rate40":2300,"n20":1,"n40":1},{"date":"2026-07-08","origin":"DALIAN","dest":"NHAVA SHEVA","rate20":2008,"rate40":2048,"n20":46,"n40":47},{"date":"2026-07-08","origin":"NANSHA","dest":"CHENNAI","rate20":2010,"rate40":2040,"n20":5,"n40":5},{"date":"2026-07-08","origin":"NANSHA","dest":"KOLKATA","rate20":1825,"rate40":2000,"n20":4,"n40":4},{"date":"2026-07-08","origin":"NANSHA","dest":"NHAVA SHEVA","rate20":1770,"rate40":2000,"n20":5,"n40":5},{"date":"2026-07-08","origin":"NINGBO","dest":"CHENNAI","rate20":2075,"rate40":2125,"n20":2,"n40":4},{"date":"2026-07-08","origin":"NINGBO","dest":"KOLKATA","rate20":1845,"rate40":2200,"n20":5,"n40":5},{"date":"2026-07-08","origin":"NINGBO","dest":"NHAVA SHEVA","rate20":1871,"rate40":1897,"n20":15,"n40":15},{"date":"2026-07-08","origin":"QINGDAO","dest":"CHENNAI","rate20":2216,"rate40":2396,"n20":5,"n40":5},{"date":"2026-07-08","origin":"QINGDAO","dest":"KOLKATA","rate20":2417,"rate40":2617,"n20":3,"n40":3},{"date":"2026-07-08","origin":"QINGDAO","dest":"NHAVA SHEVA","rate20":2239,"rate40":2266,"n20":7,"n40":8},{"date":"2026-07-08","origin":"SHANGHAI","dest":"CHENNAI","rate20":1958,"rate40":2102,"n20":6,"n40":6},{"date":"2026-07-08","origin":"SHANGHAI","dest":"KOLKATA","rate20":1885,"rate40":2430,"n20":5,"n40":5},{"date":"2026-07-08","origin":"SHANGHAI","dest":"NHAVA SHEVA","rate20":1905,"rate40":1960,"n20":14,"n40":14},{"date":"2026-07-08","origin":"SHEKOU","dest":"CHENNAI","rate20":2230,"rate40":2350,"n20":5,"n40":6},{"date":"2026-07-08","origin":"SHENZHEN","dest":"KOLKATA","rate20":1833,"rate40":2167,"n20":6,"n40":6},{"date":"2026-07-08","origin":"SHENZHEN","dest":"NHAVA SHEVA","rate20":1704,"rate40":1778,"n20":13,"n40":13},{"date":"2026-07-08","origin":"TIANJIN","dest":"CHENNAI","rate20":1762,"rate40":1812,"n20":4,"n40":4},{"date":"2026-07-08","origin":"TIANJIN","dest":"KOLKATA","rate20":2075,"rate40":2075,"n20":2,"n40":2},{"date":"2026-07-08","origin":"TIANJIN","dest":"NHAVA SHEVA","rate20":2204,"rate40":2312,"n20":6,"n40":6},{"date":"2026-07-08","origin":"XIAMEN","dest":"CHENNAI","rate20":1538,"rate40":1688,"n20":4,"n40":4},{"date":"2026-07-08","origin":"XIAMEN","dest":"KOLKATA","rate20":1883,"rate40":2233,"n20":3,"n40":3},{"date":"2026-07-08","origin":"XIAMEN","dest":"NHAVA SHEVA","rate20":1790,"rate40":1790,"n20":5,"n40":5},{"date":"2026-07-10","origin":"DALIAN","dest":"CHENNAI","rate20":1838,"rate40":1912,"n20":4,"n40":4},{"date":"2026-07-10","origin":"DALIAN","dest":"KOLKATA","rate20":1881,"rate40":1975,"n20":48,"n40":51},{"date":"2026-07-10","origin":"DALIAN","dest":"NHAVA SHEVA","rate20":2150,"rate40":2150,"n20":4,"n40":4},{"date":"2026-07-10","origin":"NANSHA","dest":"CHENNAI","rate20":2030,"rate40":2060,"n20":5,"n40":5},{"date":"2026-07-10","origin":"NANSHA","dest":"KOLKATA","rate20":1750,"rate40":1875,"n20":4,"n40":4},{"date":"2026-07-10","origin":"NANSHA","dest":"NHAVA SHEVA","rate20":1858,"rate40":1908,"n20":6,"n40":6},{"date":"2026-07-10","origin":"NINGBO","dest":"CHENNAI","rate20":2033,"rate40":2130,"n20":3,"n40":5},{"date":"2026-07-10","origin":"NINGBO","dest":"KOLKATA","rate20":1850,"rate40":2171,"n20":7,"n40":7},{"date":"2026-07-10","origin":"NINGBO","dest":"NHAVA SHEVA","rate20":1826,"rate40":1869,"n20":14,"n40":14},{"date":"2026-07-10","origin":"QINGDAO","dest":"CHENNAI","rate20":2133,"rate40":2313,"n20":5,"n40":5},{"date":"2026-07-10","origin":"QINGDAO","dest":"KOLKATA","rate20":2300,"rate40":2525,"n20":4,"n40":4},{"date":"2026-07-10","origin":"QINGDAO","dest":"NHAVA SHEVA","rate20":2153,"rate40":2175,"n20":8,"n40":10},{"date":"2026-07-10","origin":"SHANGHAI","dest":"CHENNAI","rate20":1912,"rate40":2032,"n20":6,"n40":6},{"date":"2026-07-10","origin":"SHANGHAI","dest":"KOLKATA","rate20":1896,"rate40":2350,"n20":6,"n40":6},{"date":"2026-07-10","origin":"SHANGHAI","dest":"NHAVA SHEVA","rate20":1832,"rate40":1899,"n20":15,"n40":16},{"date":"2026-07-10","origin":"SHEKOU","dest":"CHENNAI","rate20":2225,"rate40":2330,"n20":4,"n40":5},{"date":"2026-07-10","origin":"SHENZHEN","dest":"KOLKATA","rate20":1800,"rate40":2133,"n20":6,"n40":6},{"date":"2026-07-10","origin":"SHENZHEN","dest":"NHAVA SHEVA","rate20":1668,"rate40":1720,"n20":12,"n40":12},{"date":"2026-07-10","origin":"TIANJIN","dest":"CHENNAI","rate20":1770,"rate40":1810,"n20":5,"n40":5},{"date":"2026-07-10","origin":"TIANJIN","dest":"KOLKATA","rate20":2167,"rate40":2200,"n20":3,"n40":3},{"date":"2026-07-10","origin":"TIANJIN","dest":"NHAVA SHEVA","rate20":2134,"rate40":2216,"n20":8,"n40":8},{"date":"2026-07-10","origin":"XIAMEN","dest":"CHENNAI","rate20":1580,"rate40":1720,"n20":5,"n40":5},{"date":"2026-07-10","origin":"XIAMEN","dest":"KOLKATA","rate20":1850,"rate40":2162,"n20":4,"n40":4},{"date":"2026-07-10","origin":"XIAMEN","dest":"NHAVA SHEVA","rate20":1740,"rate40":1750,"n20":5,"n40":5},{"date":"2026-07-13","origin":"DALIAN","dest":"CHENNAI","rate20":1838,"rate40":1912,"n20":4,"n40":4},{"date":"2026-07-13","origin":"DALIAN","dest":"KOLKATA","rate20":1836,"rate40":1911,"n20":43,"n40":46},{"date":"2026-07-13","origin":"DALIAN","dest":"NHAVA SHEVA","rate20":2150,"rate40":2150,"n20":5,"n40":5},{"date":"2026-07-13","origin":"NANSHA","dest":"CHENNAI","rate20":2025,"rate40":2117,"n20":4,"n40":3},{"date":"2026-07-13","origin":"NANSHA","dest":"KOLKATA","rate20":1750,"rate40":1875,"n20":4,"n40":4},{"date":"2026-07-13","origin":"NANSHA","dest":"NHAVA SHEVA","rate20":1625,"rate40":1675,"n20":3,"n40":4},{"date":"2026-07-13","origin":"NINGBO","dest":"CHENNAI","rate20":1900,"rate40":2100,"n20":2,"n40":4},{"date":"2026-07-13","origin":"NINGBO","dest":"KOLKATA","rate20":1780,"rate40":2133,"n20":5,"n40":6},{"date":"2026-07-13","origin":"NINGBO","dest":"NHAVA SHEVA","rate20":1770,"rate40":1816,"n20":13,"n40":13},{"date":"2026-07-13","origin":"QINGDAO","dest":"CHENNAI","rate20":2317,"rate40":2412,"n20":3,"n40":4},{"date":"2026-07-13","origin":"QINGDAO","dest":"KOLKATA","rate20":2230,"rate40":2430,"n20":5,"n40":5},{"date":"2026-07-13","origin":"QINGDAO","dest":"NHAVA SHEVA","rate20":1989,"rate40":2030,"n20":9,"n40":10},{"date":"2026-07-13","origin":"SHANGHAI","dest":"CHENNAI","rate20":1875,"rate40":1950,"n20":3,"n40":3},{"date":"2026-07-13","origin":"SHANGHAI","dest":"KOLKATA","rate20":1955,"rate40":2390,"n20":5,"n40":5},{"date":"2026-07-13","origin":"SHANGHAI","dest":"NHAVA SHEVA","rate20":1794,"rate40":1866,"n20":14,"n40":15},{"date":"2026-07-13","origin":"SHEKOU","dest":"CHENNAI","rate20":2288,"rate40":2369,"n20":8,"n40":8},{"date":"2026-07-13","origin":"SHENZHEN","dest":"KOLKATA","rate20":1783,"rate40":2117,"n20":6,"n40":6},{"date":"2026-07-13","origin":"SHENZHEN","dest":"NHAVA SHEVA","rate20":1648,"rate40":1693,"n20":10,"n40":11},{"date":"2026-07-13","origin":"TIANJIN","dest":"CHENNAI","rate20":1783,"rate40":1883,"n20":3,"n40":3},{"date":"2026-07-13","origin":"TIANJIN","dest":"KOLKATA","rate20":2125,"rate40":2158,"n20":3,"n40":3},{"date":"2026-07-13","origin":"TIANJIN","dest":"NHAVA SHEVA","rate20":2043,"rate40":2112,"n20":11,"n40":10},{"date":"2026-07-13","origin":"XIAMEN","dest":"CHENNAI","rate20":1625,"rate40":1688,"n20":3,"n40":2},{"date":"2026-07-13","origin":"XIAMEN","dest":"KOLKATA","rate20":1833,"rate40":2000,"n20":3,"n40":3},{"date":"2026-07-13","origin":"XIAMEN","dest":"NHAVA SHEVA","rate20":1712,"rate40":1725,"n20":4,"n40":4},{"date":"2026-07-15","origin":"DALIAN","dest":"CHENNAI","rate20":1806,"rate40":1881,"n20":4,"n40":4},{"date":"2026-07-15","origin":"DALIAN","dest":"KOLKATA","rate20":1712,"rate40":1814,"n20":40,"n40":45},{"date":"2026-07-15","origin":"DALIAN","dest":"NHAVA SHEVA","rate20":1975,"rate40":1975,"n20":5,"n40":5},{"date":"2026-07-15","origin":"NANSHA","dest":"CHENNAI","rate20":2030,"rate40":2060,"n20":5,"n40":5},{"date":"2026-07-15","origin":"NANSHA","dest":"KOLKATA","rate20":1750,"rate40":1875,"n20":4,"n40":4},{"date":"2026-07-15","origin":"NANSHA","dest":"NHAVA SHEVA","rate20":1619,"rate40":1650,"n20":4,"n40":5},{"date":"2026-07-15","origin":"NINGBO","dest":"CHENNAI","rate20":1933,"rate40":2025,"n20":3,"n40":4},{"date":"2026-07-15","origin":"NINGBO","dest":"KOLKATA","rate20":1890,"rate40":2192,"n20":5,"n40":6},{"date":"2026-07-15","origin":"NINGBO","dest":"NHAVA SHEVA","rate20":1694,"rate40":1744,"n20":16,"n40":16},{"date":"2026-07-15","origin":"QINGDAO","dest":"CHENNAI","rate20":2150,"rate40":2233,"n20":5,"n40":6},{"date":"2026-07-15","origin":"QINGDAO","dest":"KOLKATA","rate20":2210,"rate40":2410,"n20":5,"n40":5},{"date":"2026-07-15","origin":"QINGDAO","dest":"NHAVA SHEVA","rate20":1927,"rate40":1954,"n20":11,"n40":12},{"date":"2026-07-15","origin":"SHANGHAI","dest":"CHENNAI","rate20":1915,"rate40":2020,"n20":5,"n40":5},{"date":"2026-07-15","origin":"SHANGHAI","dest":"KOLKATA","rate20":1955,"rate40":2390,"n20":5,"n40":5},{"date":"2026-07-15","origin":"SHANGHAI","dest":"NHAVA SHEVA","rate20":1712,"rate40":1759,"n20":15,"n40":17},{"date":"2026-07-15","origin":"SHEKOU","dest":"CHENNAI","rate20":2190,"rate40":2300,"n20":7,"n40":6},{"date":"2026-07-15","origin":"SHENZHEN","dest":"KOLKATA","rate20":1854,"rate40":2142,"n20":6,"n40":6},{"date":"2026-07-15","origin":"SHENZHEN","dest":"NHAVA SHEVA","rate20":1606,"rate40":1636,"n20":12,"n40":15},{"date":"2026-07-15","origin":"TIANJIN","dest":"CHENNAI","rate20":1762,"rate40":1862,"n20":4,"n40":4},{"date":"2026-07-15","origin":"TIANJIN","dest":"KOLKATA","rate20":2125,"rate40":2158,"n20":3,"n40":3},{"date":"2026-07-15","origin":"TIANJIN","dest":"NHAVA SHEVA","rate20":1925,"rate40":2003,"n20":9,"n40":8},{"date":"2026-07-15","origin":"XIAMEN","dest":"CHENNAI","rate20":1612,"rate40":1650,"n20":4,"n40":3},{"date":"2026-07-15","origin":"XIAMEN","dest":"KOLKATA","rate20":1833,"rate40":2183,"n20":3,"n40":3},{"date":"2026-07-15","origin":"XIAMEN","dest":"NHAVA SHEVA","rate20":1662,"rate40":1712,"n20":3,"n40":3},{"date":"2026-07-16","origin":"DALIAN","dest":"CHENNAI","rate20":1856,"rate40":1931,"n20":4,"n40":4},{"date":"2026-07-16","origin":"DALIAN","dest":"KOLKATA","rate20":2212,"rate40":2362,"n20":2,"n40":2},{"date":"2026-07-16","origin":"DALIAN","dest":"NHAVA SHEVA","rate20":2025,"rate40":2025,"n20":5,"n40":5},{"date":"2026-07-16","origin":"NANSHA","dest":"CHENNAI","rate20":2038,"rate40":2075,"n20":4,"n40":4},{"date":"2026-07-16","origin":"NANSHA","dest":"KOLKATA","rate20":1750,"rate40":1875,"n20":4,"n40":4},{"date":"2026-07-16","origin":"NANSHA","dest":"NHAVA SHEVA","rate20":1619,"rate40":1650,"n20":4,"n40":5},{"date":"2026-07-16","origin":"NINGBO","dest":"CHENNAI","rate20":1933,"rate40":2025,"n20":3,"n40":4},{"date":"2026-07-16","origin":"NINGBO","dest":"KOLKATA","rate20":1900,"rate40":2625,"n20":2,"n40":2},{"date":"2026-07-16","origin":"NINGBO","dest":"NHAVA SHEVA","rate20":1693,"rate40":1743,"n20":13,"n40":13},{"date":"2026-07-16","origin":"QINGDAO","dest":"CHENNAI","rate20":2200,"rate40":2283,"n20":5,"n40":6},{"date":"2026-07-16","origin":"QINGDAO","dest":"KOLKATA","rate20":2083,"rate40":2217,"n20":3,"n40":3},{"date":"2026-07-16","origin":"QINGDAO","dest":"NHAVA SHEVA","rate20":1975,"rate40":2000,"n20":10,"n40":11},{"date":"2026-07-16","origin":"SHANGHAI","dest":"CHENNAI","rate20":1915,"rate40":2020,"n20":5,"n40":5},{"date":"2026-07-16","origin":"SHANGHAI","dest":"KOLKATA","rate20":1925,"rate40":2075,"n20":2,"n40":2},{"date":"2026-07-16","origin":"SHANGHAI","dest":"NHAVA SHEVA","rate20":1710,"rate40":1774,"n20":13,"n40":13},{"date":"2026-07-16","origin":"SHEKOU","dest":"CHENNAI","rate20":2190,"rate40":2300,"n20":7,"n40":6},{"date":"2026-07-16","origin":"SHENZHEN","dest":"KOLKATA","rate20":1854,"rate40":2142,"n20":6,"n40":6},{"date":"2026-07-16","origin":"SHENZHEN","dest":"NHAVA SHEVA","rate20":1606,"rate40":1624,"n20":12,"n40":14},{"date":"2026-07-16","origin":"TIANJIN","dest":"CHENNAI","rate20":1812,"rate40":1912,"n20":4,"n40":4},{"date":"2026-07-16","origin":"TIANJIN","dest":"KOLKATA","rate20":2200,"rate40":2250,"n20":2,"n40":2},{"date":"2026-07-16","origin":"TIANJIN","dest":"NHAVA SHEVA","rate20":1981,"rate40":2006,"n20":4,"n40":4},{"date":"2026-07-16","origin":"XIAMEN","dest":"CHENNAI","rate20":1612,"rate40":1650,"n20":4,"n40":3},{"date":"2026-07-16","origin":"XIAMEN","dest":"KOLKATA","rate20":1800,"rate40":2600,"n20":1,"n40":1},{"date":"2026-07-16","origin":"XIAMEN","dest":"NHAVA SHEVA","rate20":1662,"rate40":1712,"n20":3,"n40":3},{"date":"2026-07-17","origin":"DALIAN","dest":"CHENNAI","rate20":1831,"rate40":1906,"n20":8,"n40":8},{"date":"2026-07-17","origin":"DALIAN","dest":"KOLKATA","rate20":2160,"rate40":2280,"n20":5,"n40":5},{"date":"2026-07-17","origin":"DALIAN","dest":"NHAVA SHEVA","rate20":1722,"rate40":1795,"n20":44,"n40":49},{"date":"2026-07-17","origin":"NANSHA","dest":"CHENNAI","rate20":2045,"rate40":2105,"n20":10,"n40":10},{"date":"2026-07-17","origin":"NANSHA","dest":"KOLKATA","rate20":1729,"rate40":1843,"n20":7,"n40":7},{"date":"2026-07-17","origin":"NANSHA","dest":"NHAVA SHEVA","rate20":1572,"rate40":1617,"n20":9,"n40":9},{"date":"2026-07-17","origin":"NINGBO","dest":"CHENNAI","rate20":2100,"rate40":2117,"n20":4,"n40":6},{"date":"2026-07-17","origin":"NINGBO","dest":"KOLKATA","rate20":1956,"rate40":2344,"n20":8,"n40":8},{"date":"2026-07-17","origin":"NINGBO","dest":"NHAVA SHEVA","rate20":1701,"rate40":1756,"n20":27,"n40":27},{"date":"2026-07-17","origin":"QINGDAO","dest":"CHENNAI","rate20":2238,"rate40":2315,"n20":8,"n40":10},{"date":"2026-07-17","origin":"QINGDAO","dest":"KOLKATA","rate20":2162,"rate40":2338,"n20":8,"n40":8},{"date":"2026-07-17","origin":"QINGDAO","dest":"NHAVA SHEVA","rate20":1938,"rate40":1939,"n20":17,"n40":18},{"date":"2026-07-17","origin":"SHANGHAI","dest":"CHENNAI","rate20":1921,"rate40":2008,"n20":12,"n40":12},{"date":"2026-07-17","origin":"SHANGHAI","dest":"KOLKATA","rate20":2083,"rate40":2467,"n20":6,"n40":6},{"date":"2026-07-17","origin":"SHANGHAI","dest":"NHAVA SHEVA","rate20":1674,"rate40":1732,"n20":21,"n40":21},{"date":"2026-07-17","origin":"SHEKOU","dest":"CHENNAI","rate20":2158,"rate40":2262,"n20":14,"n40":12},{"date":"2026-07-17","origin":"SHENZHEN","dest":"KOLKATA","rate20":1905,"rate40":2273,"n20":11,"n40":11},{"date":"2026-07-17","origin":"SHENZHEN","dest":"NHAVA SHEVA","rate20":1560,"rate40":1586,"n20":20,"n40":26},{"date":"2026-07-17","origin":"TIANJIN","dest":"CHENNAI","rate20":1844,"rate40":1906,"n20":8,"n40":8},{"date":"2026-07-17","origin":"TIANJIN","dest":"KOLKATA","rate20":2155,"rate40":2195,"n20":5,"n40":5},{"date":"2026-07-17","origin":"TIANJIN","dest":"NHAVA SHEVA","rate20":1873,"rate40":1892,"n20":13,"n40":13},{"date":"2026-07-17","origin":"XIAMEN","dest":"CHENNAI","rate20":1605,"rate40":1656,"n20":10,"n40":8},{"date":"2026-07-17","origin":"XIAMEN","dest":"KOLKATA","rate20":1869,"rate40":2162,"n20":8,"n40":8},{"date":"2026-07-17","origin":"XIAMEN","dest":"NHAVA SHEVA","rate20":1637,"rate40":1692,"n20":5,"n40":5}];

const DESTS = ["NHAVA SHEVA", "CHENNAI", "KOLKATA"];
const DAY = 86400000;
const ts = (d) => new Date(d + "T00:00:00Z").getTime();
const fmtShort = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtLong = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const LATEST = INDEX_DATA.reduce((m, r) => (r.date > m ? r.date : m), "");

export default function FreightTracker() {
  const [dest, setDest] = useState("NHAVA SHEVA");
  const [origin, setOrigin] = useState("SHENZHEN");

  const origins = useMemo(
    () => [...new Set(INDEX_DATA.filter((r) => r.dest === dest).map((r) => r.origin))].sort(),
    [dest]
  );
  const activeOrigin = origins.includes(origin) ? origin : origins[0];

  const series = useMemo(
    () =>
      INDEX_DATA.filter((r) => r.dest === dest && r.origin === activeOrigin)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ ...r, t: ts(r.date) })),
    [dest, activeOrigin]
  );

  const latest = series[series.length - 1];
  const first = series[0];
  const pct = (a, b) => (a && b ? (((b - a) / a) * 100).toFixed(1) : null);
  const d20 = pct(first?.rate20, latest?.rate20);
  const d40 = pct(first?.rate40, latest?.rate40);
  const thin = series.some((s) => s.n40 > 0 && s.n40 < 5);
  const spanDays = series.length > 1 ? Math.round((latest.t - first.t) / DAY) : 0;

  // Age of the newest observation, relative to the dataset's own latest date.
  const staleDays = latest ? Math.round((ts(LATEST) - latest.t) / DAY) : 0;

  const table = useMemo(
    () =>
      INDEX_DATA.filter((r) => r.dest === dest && r.date === LATEST).sort(
        (a, b) => (b.rate40 || 0) - (a.rate40 || 0)
      ),
    [dest]
  );

  const domain = series.length ? [first.t - DAY, latest.t + DAY] : [0, 1];

  return (
    <div className="min-h-screen bg-white text-slate-900 p-5 md:p-10">
      <div className="max-w-4xl mx-auto space-y-7">
        <header className="border-b border-slate-200 pb-5">
          <p className="text-[11px] tracking-[0.22em] uppercase text-slate-500">iKargos</p>
          <h1 className="text-2xl md:text-4xl font-semibold mt-2 tracking-tight">
            China → India Freight Tracker
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Indicative spot rates · updated when carriers revise pricing, not on a fixed schedule
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="inline-flex items-center gap-1.5 text-xs bg-slate-100 text-slate-700 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Rates as of {fmtLong(ts(LATEST))}
            </span>
            <span className="text-xs text-slate-500">
              {series.length} observations over {spanDays} days
            </span>
          </div>
        </header>

        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Destination</label>
            <select value={dest} onChange={(e) => setDest(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white min-w-[160px]">
              {DESTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Origin port</label>
            <select value={activeOrigin} onChange={(e) => setOrigin(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white min-w-[160px]">
              {origins.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { l: "20ft", v: latest?.rate20, d: d20, n: latest?.n20 },
            { l: "40ft / 40HQ", v: latest?.rate40, d: d40, n: latest?.n40 },
          ].map((c) => (
            <div key={c.l} className="border border-slate-200 rounded-lg p-4 md:p-5">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">{c.l}</p>
              <p className="text-2xl md:text-3xl font-semibold mt-1 tabular-nums">
                {c.v ? `$${c.v.toLocaleString()}` : "—"}
              </p>
              {c.d && (
                <p className={`text-xs mt-1 ${Number(c.d) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {Number(c.d) > 0 ? "▲" : "▼"} {Math.abs(c.d)}% over {spanDays} days
                </p>
              )}
              <p className="text-[11px] text-slate-400 mt-0.5">{c.n} carrier quotes</p>
            </div>
          ))}
        </div>

        <section className="border border-slate-200 rounded-lg p-4 md:p-5">
          <h2 className="text-sm font-semibold">{activeOrigin} → {dest}</h2>
          <p className="text-xs text-slate-500 mb-4">
            Average rate per container, USD · each dot is one rate update from the agent
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={series} margin={{ top: 5, right: 8, bottom: 5, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={domain}
                ticks={series.map((s) => s.t)}
                tickFormatter={fmtShort}
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={{ stroke: "#e2e8f0" }}
                tickLine={false}
                minTickGap={14}
              />
              <YAxis domain={["dataMin - 100", "dataMax + 100"]} tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                labelFormatter={fmtLong}
                formatter={(v, n, p) => [
                  v ? `$${v.toLocaleString()} · ${n === "20ft" ? p.payload.n20 : p.payload.n40} quotes` : "—", n,
                ]}
              />
              <Legend iconType="line" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              <Line type="linear" dataKey="rate20" name="20ft" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="linear" dataKey="rate40" name="40ft" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3.5 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>

          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Dots are spaced by actual calendar date. Wide gaps mean no rate update was issued in that period —
            typically because pricing held steady or sailings were closed. A flat segment is not a measured
            trend, only the absence of a revision.
          </p>

          {thin && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 mt-2">
              Some points on this lane come from fewer than 5 carrier quotes — treat movement with caution.
            </p>
          )}
        </section>

        <section className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">All origins → {dest}</h2>
            <span className="text-[11px] text-slate-500">as of {fmtShort(ts(LATEST))}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Origin</th>
                <th className="text-right px-4 py-2 font-medium">20ft</th>
                <th className="text-right px-4 py-2 font-medium">40ft</th>
                <th className="text-right px-4 py-2 font-medium">Quotes</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.origin} onClick={() => setOrigin(r.origin)}
                  className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${r.origin === activeOrigin ? "bg-slate-50" : ""}`}>
                  <td className="px-4 py-2 capitalize">{r.origin.toLowerCase()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.rate20 ? `$${r.rate20}` : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{r.rate40 ? `$${r.rate40}` : "—"}</td>
                  <td className="px-4 py-2 text-right text-slate-400 tabular-nums">{r.n40}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="border-t border-slate-200 pt-5 space-y-3 text-xs text-slate-500 leading-relaxed">
          <p>
            <strong className="text-slate-700">How this is calculated.</strong> Each point is the simple average of
            every carrier quotation received for that lane on that date. 40HQ is treated as 40ft. Carrier identities
            are not disclosed. Quote counts are shown so you can judge how much weight a point carries.
          </p>
          <p>
            <strong className="text-slate-700">Coverage and limits.</strong> Rates are compiled from a single freight
            forwarding source and reflect that forwarder&apos;s book, not the whole market. Updates arrive when
            carriers revise pricing, so intervals are irregular. This tracker indicates market{" "}
            <em>direction</em> only — it is not a quotation, not a booking offer, and should not be used to price a
            shipment. Actual rates vary by volume, commodity, equipment availability and sailing date.
          </p>
        </div>
      </div>
    </div>
  );
}
