import { Pressable, StyleSheet, Animated, Dimensions } from "react-native";
import { useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Text as SvgText } from "react-native-svg";
import { View } from "react-native";
import { ActivityIndicator } from "react-native-paper";


const screenWidth = Dimensions.get("window").width;

const ButtonAI = ({onClick, isGenerating}: {onClick: () => void, isGenerating: boolean}) => {
  const [scale] = useState(new Animated.Value(1));

  const handlePressIn = () => {
    if (isGenerating) return;
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (isGenerating) return;
    onClick()
    Animated.spring(scale, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[styles.buttonWrapper, { transform: [{ scale }] }]}>
    <View style={{position: "absolute", left: 0,}}>
        <LinearGradient
          colors={["#1DEFEF", "#DE0FE9"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientBorder}
        />
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={styles.innerButton}
        >
          <Svg height="36" width="100%" style={{ backgroundColor: "transparent" }}>
            <Defs>
              <SvgGradient id="grad" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#1DEFEF" />
                <Stop offset="1" stopColor="#DE0FE9" />
              </SvgGradient>
            </Defs>

            {!isGenerating ? (
                <SvgText
                    fill="url(#grad)"
                    fontSize="14"
                    fontWeight="bold"
                    x="51%"
                    y="24"
                    textAnchor="middle"
                    >
                        Generate witn AI
                </SvgText>
            ): <ActivityIndicator color="purple" style={{marginTop: 5}}/>}
            
          </Svg>
        </Pressable>
    </View>  
    
  
</Animated.View>

  );
};

const styles = StyleSheet.create({
  buttonWrapper: {
    width: (screenWidth * 0.92) ,
    alignItems: "center",
    position: "relative",
    
  },
  gradientBorder: {        
    borderRadius: 10,  
    overflow: "hidden",
    height: 60,
    position: "absolute",
    left: 0,
    width: (screenWidth * 0.92) ,
     
  },
  innerButton: {
    width: (screenWidth * 0.92) - 4,
    left: 2,
    top: 2.2,
    height: 53,
    position: "absolute",
    borderRadius: 8,   
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgb(20, 0, 29)",
    
  },
});

export default ButtonAI;
